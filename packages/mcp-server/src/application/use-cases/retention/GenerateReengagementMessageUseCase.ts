import { Result, ok, fail } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { IAiResponsesRunner } from "../../../domain/services/IAiResponsesRunner"
import { parseReengagementMessage } from "./schemas/reengagement-message.schema"

export interface GenerateReengagementMessageInput {
  salonId: string
  salonName: string
  agentTone: string
  customerName: string
  lastServiceName: string | null
  lastProfessionalName: string | null
  daysSinceVisit: number
  toneOverride?: string | null
  includeCoupon: boolean
  /**
   * If true, the system prompt instructs the LLM to OMIT the opt-out footer
   * ("responder PARAR" etc). Salon-level decision — bypasses LGPD/anti-ban
   * mitigation. The hard regex in the worker still catches "PARAR" replies,
   * so customers who know the keyword can still opt out.
   */
  skipOptOutFooter?: boolean
  model: string
  maxTokens?: number
}

export interface GenerateReengagementMessageOutput {
  message: string
  tokensUsed: number
  modelUsed: string
}

class AiGenerationFailedError extends DomainError {
  readonly code = "AI_GENERATION_FAILED"
  constructor(reason: string) {
    super(`Falha na geracao da mensagem de reengajamento: ${reason}`)
  }
}

const FIRST_NAME_RE = /^\S+/

function buildSystemPrompt(args: {
  salonName: string
  tone: string
  includeCoupon: boolean
  skipOptOutFooter: boolean
}): string {
  const couponClause = args.includeCoupon
    ? "Pode mencionar discretamente que ha um horario aberto ou uma condicao especial, sem prometer preços ou descontos especificos."
    : "NAO mencione descontos, promocoes ou condicoes especiais."

  // Opt-out footer: regulatory + anti-ban best practice. Disabled when the salon
  // explicitly requests "passar-se por humano" — the message must look exactly
  // like a real receptionist typed it, with no automation hint.
  const optOutClause = args.skipOptOutFooter
    ? "7. NAO inclua nenhum aviso de opt-out, descadastro ou \"responder PARAR\". A mensagem deve parecer escrita por uma pessoa real do salao, sem qualquer pista de automacao. NAO mencione \"sistema\", \"automatico\", \"avisos\" ou similares."
    : "7. Inclua sempre um opt-out natural no final, como \"Se nao quiser receber esses avisos, e so avisar\" ou \"Se preferir nao receber, e so responder PARAR\"."

  return [
    `Voce e a recepcionista virtual do salao "${args.salonName}".`,
    "Sua funcao e criar mensagens curtas e altamente persuasivas de WhatsApp para reconquistar clientes inativos.",
    "",
    "REGRAS OBRIGATORIAS:",
    "1. Pareca humano. NUNCA use saudacoes robaticas como \"Prezado cliente\" ou \"Ola, como vai?\". Use \"Oi [Nome]\", \"Oie [Nome]\", \"Tudo bem, [Nome]?\".",
    "2. Seja ultra-especifica. Mencione o ultimo servico realizado e crie uma justificativa natural para o contato.",
    "3. Seja concisa. Maximo de 3 frases. Pessoas ignoram blocos de texto no WhatsApp.",
    "4. Tamanho total entre 60 e 220 caracteres.",
    `5. ${couponClause}`,
    "6. NUNCA invente nomes, valores, horarios fixos ou compromissos do salao.",
    optOutClause,
    "8. Retorne APENAS um objeto JSON valido com a chave \"mensagem\". Sem markdown, sem explicacoes.",
    `9. Tom de voz do salao: ${args.tone}.`,
    "",
    "Formato de Saida Esperado:",
    "{\"mensagem\": \"texto gerado aqui\"}",
  ].join("\n")
}

function buildUserPrompt(args: {
  customerName: string
  lastServiceName: string | null
  daysSinceVisit: number
  lastProfessionalName: string | null
  tone: string
}): string {
  const firstName = (args.customerName.match(FIRST_NAME_RE)?.[0] || args.customerName).trim()
  const service = args.lastServiceName || "ultimo servico"
  const professional = args.lastProfessionalName || "profissional"
  return [
    "Dados do Cliente:",
    `- Nome: ${firstName}`,
    `- Ultimo Servico: ${service}`,
    `- Dias desde a ultima visita: ${args.daysSinceVisit}`,
    `- Profissional anterior: ${professional}`,
    `- Tom de voz: ${args.tone}`,
    "",
    "Gere a mensagem de reconquista.",
  ].join("\n")
}

/**
 * Calls the LLM (via IAiResponsesRunner port) to produce a personalized
 * retention message. Output is validated by zod; on any failure the use
 * case returns Result.fail and the caller falls back to the static template.
 */
export class GenerateReengagementMessageUseCase {
  constructor(private aiRunner: IAiResponsesRunner) {}

  async execute(
    input: GenerateReengagementMessageInput
  ): Promise<Result<GenerateReengagementMessageOutput, DomainError>> {
    if (!input.salonId) return fail(new RequiredFieldError("salonId"))
    if (!input.customerName) return fail(new RequiredFieldError("customerName"))
    if (!input.model) return fail(new RequiredFieldError("model"))

    const tone = (input.toneOverride && input.toneOverride.trim()) || input.agentTone || "Amigavel e profissional"
    const systemPrompt = buildSystemPrompt({
      salonName: input.salonName,
      tone,
      includeCoupon: input.includeCoupon,
      skipOptOutFooter: input.skipOptOutFooter ?? false,
    })
    const userPrompt = buildUserPrompt({
      customerName: input.customerName,
      lastServiceName: input.lastServiceName,
      daysSinceVisit: input.daysSinceVisit,
      lastProfessionalName: input.lastProfessionalName,
      tone,
    })

    try {
      const result = await this.aiRunner.runJson(
        {
          model: input.model,
          systemPrompt,
          userPrompt,
          maxTokens: input.maxTokens ?? 200,
          temperature: 0.7,
          callerLabel: "GenerateReengagementMessageUseCase",
        },
        parseReengagementMessage
      )

      return ok({
        message: result.output.mensagem.trim(),
        tokensUsed: result.tokensUsed,
        modelUsed: result.modelUsed,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return fail(new AiGenerationFailedError(reason))
    }
  }
}
