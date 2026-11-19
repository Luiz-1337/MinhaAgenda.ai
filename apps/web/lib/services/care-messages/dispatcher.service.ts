import {
  db,
  chats,
  and,
  eq,
  inArray,
  DEFAULT_REVIEW_WHATSAPP_TEXT,
  DEFAULT_SUBSCRIPTION_DUE_TEXT,
  claimDueCareDispatches,
  enqueueDuePreCareMessages,
  enqueueDueSubscriptionReminders,
  finishCareDispatch,
  formatSubscriptionDueDate,
  isWithinCareSendHours,
  renderCareMessage,
  type ClaimedCareDispatch,
} from "@repo/db"
// Relativos (padrão do repo p/ módulos que podem entrar no grafo do worker).
import { findOrCreateChat, saveMessage } from "../chat.service"
import { ProactiveTemplateRequiredError, sendProactiveMessage } from "../messaging/proactive"
import { logger } from "../../infra/logger"

/**
 * A fila de mensagens ao cliente (docs/ROADMAP.md, fase 6, fatia 6d): cuidados de
 * antes e de depois, retorno, o pedido de avaliação e o aviso de vencimento da
 * assinatura (fase 8, fatia 8d).
 *
 * O cron chama `runCareMessageDispatcher` a cada meia hora. A regra (o que enviar,
 * o que pular, o que esperar) é do `@repo/db`; aqui só se monta o texto, se envia
 * pelo canal do salão e se grava a mensagem na conversa, para a IA saber o que o
 * cliente recebeu quando ele responder.
 *
 * Falha NÃO é reenviada: fica registrada na tela de envios, com o motivo. Reenviar
 * sozinho arrisca mandar a mesma mensagem duas vezes.
 */

/** Envios por execução. A cada meia hora, das 9h às 20h, dá folga de sobra. */
const BATCH_SIZE = 40

export interface CareMessageDispatcherResult {
  /** Fora do horário de envio: nada foi feito. */
  outsideHours: boolean
  preCareQueued: number
  /** Avisos de vencimento de assinatura que entraram na fila nesta execução. */
  subscriptionQueued: number
  sent: number
  failed: number
  skipped: number
  waiting: number
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.minhaagenda.ai").replace(/\/+$/, "")
}

/** O texto que sai. NULL = não há o que enviar (a regra já devia ter pulado). */
function buildBody(dispatch: ClaimedCareDispatch): string | null {
  if (dispatch.kind === "review") {
    if (!dispatch.review) return null
    return renderCareMessage(dispatch.review.whatsappText ?? DEFAULT_REVIEW_WHATSAPP_TEXT, {
      customerName: dispatch.customerName,
      salonName: dispatch.salonName,
      link: `${appBaseUrl()}/avaliar/${dispatch.review.token}`,
    })
  }

  if (dispatch.kind === "subscription_due") {
    if (!dispatch.subscription) return null
    return renderCareMessage(dispatch.subscription.message ?? DEFAULT_SUBSCRIPTION_DUE_TEXT, {
      customerName: dispatch.customerName,
      salonName: dispatch.salonName,
      itemName: dispatch.itemName,
      dueDate: formatSubscriptionDueDate(dispatch.subscription.due),
    })
  }

  if (!dispatch.ruleMessage) return null
  return renderCareMessage(dispatch.ruleMessage, {
    customerName: dispatch.customerName,
    salonName: dispatch.salonName,
    itemName: dispatch.itemName,
  })
}

/**
 * A conversa do cliente. `chats.client_phone` está inconsistente em produção (a
 * maioria só com dígitos, parte com '+'), então a busca tenta as duas formas; o
 * chat novo nasce só com dígitos, que é como a mensagem RECEBIDA grava — assim a
 * resposta do cliente cai na mesma conversa.
 */
async function resolveChatId(salonId: string, phone: string): Promise<string | undefined> {
  const digits = phone.replace(/\D/g, "")
  const [existing] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.salonId, salonId), inArray(chats.clientPhone, [digits, `+${digits}`])))
    .limit(1)
  if (existing) return existing.id

  return (await findOrCreateChat(digits, salonId)).id
}

function failureDetail(error: unknown): string {
  if (error instanceof ProactiveTemplateRequiredError) {
    return "WhatsApp oficial (Cloud API): fora das 24 horas da última mensagem do cliente só é possível enviar modelo aprovado pela Meta, e ainda não há um para este tipo de mensagem"
  }
  return error instanceof Error ? error.message : String(error)
}

export async function runCareMessageDispatcher(now: Date = new Date()): Promise<CareMessageDispatcherResult> {
  const result: CareMessageDispatcherResult = {
    outsideHours: false,
    preCareQueued: 0,
    subscriptionQueued: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    waiting: 0,
  }

  if (!isWithinCareSendHours(now)) {
    result.outsideHours = true
    return result
  }

  result.preCareQueued = await enqueueDuePreCareMessages(now)

  // Uma falha aqui não pode segurar as outras mensagens da fila.
  try {
    result.subscriptionQueued = await enqueueDueSubscriptionReminders(now)
  } catch (error) {
    logger.error({ err: error }, "Falha ao pôr na fila os avisos de vencimento de assinatura")
  }

  const dispatches = await claimDueCareDispatches(now, BATCH_SIZE)

  for (const dispatch of dispatches) {
    try {
      if (dispatch.decision.action === "wait") {
        await finishCareDispatch(dispatch.id, { status: "pending", now: new Date() })
        result.waiting++
        continue
      }

      if (dispatch.decision.action === "skip") {
        await finishCareDispatch(dispatch.id, { status: "skipped", detail: dispatch.decision.reason, now: new Date() })
        result.skipped++
        continue
      }

      const body = buildBody(dispatch)
      if (!body || !dispatch.phone) {
        await finishCareDispatch(dispatch.id, {
          status: "skipped",
          detail: "Não havia mensagem ou telefone para enviar",
          now: new Date(),
        })
        result.skipped++
        continue
      }

      // A conversa vem ANTES do envio: sem ela, o WhatsApp oficial não consegue
      // avaliar a janela de 24h. Falha aqui não impede o envio.
      let chatId: string | undefined
      try {
        chatId = await resolveChatId(dispatch.salonId, dispatch.phone)
      } catch (chatError) {
        logger.warn({ dispatchId: dispatch.id, err: chatError }, "Mensagem ao cliente sem conversa resolvida")
      }

      try {
        await sendProactiveMessage({ salonId: dispatch.salonId, to: dispatch.phone, text: body, chatId })
      } catch (sendError) {
        await finishCareDispatch(dispatch.id, {
          status: "failed",
          body,
          detail: failureDetail(sendError),
          now: new Date(),
        })
        result.failed++
        continue
      }

      await finishCareDispatch(dispatch.id, { status: "sent", body, now: new Date() })
      result.sent++

      // Só depois do envio confirmado; não pode derrubar a fila — a mensagem já saiu.
      if (chatId) {
        try {
          await saveMessage(chatId, "assistant", body)
        } catch (persistError) {
          logger.warn({ dispatchId: dispatch.id, chatId, err: persistError }, "Mensagem enviada mas não gravada na conversa")
        }
      }
    } catch (error) {
      // Erro fora do envio (banco, por exemplo): a linha fica "enviando" e a
      // próxima execução a marca como interrompida. Segue para a próxima.
      logger.error({ dispatchId: dispatch.id, err: error }, "Falha ao processar mensagem ao cliente")
      result.failed++
    }
  }

  return result
}
