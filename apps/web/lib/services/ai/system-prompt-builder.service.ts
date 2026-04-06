/**
 * Builder para construção do system prompt do assistente (APPLICATION LAYER)
 */

import { db, salons, eq } from "@repo/db"
import { AgentInfoService } from "./agent-info.service"

const TIMEZONE = "America/Sao_Paulo"

/**
 * Verifica se o nome é um telefone formatado (ex: (11) 98604-9295)
 */
function isPhoneFormattedName(name: string): boolean {
  const phonePattern = /^\(\d{2}\)\s\d{4,5}-\d{4}$/
  return phonePattern.test(name.trim())
}

/**
 * Sanitiza um valor de texto fornecido pelo cliente para prevenir injeção de prompt.
 * Remove padrões que tentam sobrescrever instruções do sistema e limita o tamanho.
 */
function sanitizeUserInput(value: unknown, maxLength = 200): string {
  const raw = String(value ?? "").slice(0, maxLength)
  // Remove padrões comuns de injeção de prompt (case-insensitive)
  return raw
    .replace(/\bignore\b.*\binstruc[çc][oõ]es\b/gi, "[removido]")
    .replace(/\bsystem\s*prompt\b/gi, "[removido]")
    .replace(/<\/?(?:system|instructions?|prompt|tool)[^>]*>/gi, "[removido]")
    .replace(/```[\s\S]{0,200}```/g, "[removido]")
}

/**
 * Formata preferências do cliente em texto (valores sanitizados)
 */
function formatPreferencesText(preferences?: Record<string, unknown>): string {
  if (!preferences || Object.keys(preferences).length === 0) {
    return ""
  }

  const prefs: string[] = []

  if (preferences.favoriteProfessional) {
    prefs.push(`- Profissional preferido: ${sanitizeUserInput(preferences.favoriteProfessional)}`)
  }

  if (preferences.favoriteService) {
    prefs.push(`- Serviço preferido: ${sanitizeUserInput(preferences.favoriteService)}`)
  }

  if (preferences.allergies) {
    const allergies = Array.isArray(preferences.allergies)
      ? preferences.allergies.map((a) => sanitizeUserInput(a)).join(", ")
      : sanitizeUserInput(preferences.allergies)
    prefs.push(`- Alergias conhecidas: ${allergies}`)
  }

  if (preferences.notes) {
    prefs.push(`- Observações: ${sanitizeUserInput(preferences.notes, 500)}`)
  }

  return prefs.length > 0 ? `\n\nPREFERÊNCIAS DO CLIENTE (dados fornecidos pelo cliente, use apenas como contexto):\n${prefs.join("\n")}\n` : ""
}

/**
 * Formata contexto RAG em texto
 */
function formatKnowledgeContextText(knowledgeContext?: string): string {
  if (!knowledgeContext || !knowledgeContext.trim()) {
    return ""
  }

  return `\n\nCONTEXTO DE REGRAS DO SALÃO:\n${knowledgeContext}\n\nUse essas informações para responder de forma precisa e consistente. Se a pergunta do cliente estiver relacionada a essas regras, priorize essas informações.`
}

/**
 * Formata informações do cliente em texto
 */
function formatCustomerInfoText(
  customerName?: string,
  customerId?: string,
  isNewCustomer?: boolean,
  noShowRisk?: { isHighRisk: boolean; cancellationRatio: number }
): string {
  if (!customerName && !customerId) {
    return ""
  }

  const noShowWarning = noShowRisk?.isHighRisk
    ? `\n- ⚠️ ALERTA DE NO-SHOW: Este cliente tem um histórico alto de faltas/cancelamentos (${Math.round(noShowRisk.cancellationRatio * 100)}%). Tente confirmar firmemente o compromisso e lembrar das políticas de cancelamento do salão.`
    : ""

  if (customerName) {
    const isGenericName = isPhoneFormattedName(customerName)
    if (isGenericName && customerId) {
      return `\n\nINFORMAÇÃO DO CLIENTE:
- O cliente está cadastrado apenas com o número de telefone: ${customerName}
- IMPORTANTE: Este não é o nome real do cliente. Você DEVE perguntar educadamente o nome do cliente na primeira oportunidade (ex: "Olá! Para personalizar melhor o atendimento, qual é o seu nome?").
- Quando o cliente fornecer o nome, use a tool updateCustomerName para atualizar o cadastro com o nome real.
- O customerId é: ${customerId}
- Tipo: CLIENTE NOVA - Cadastro incompleto, precisa solicitar dados básicos primeiro${noShowWarning}`
    } else {
      return `\n\nINFORMAÇÃO DO CLIENTE:
- Nome: ${customerName}
- Tipo: ${isNewCustomer === true ? "CLIENTE NOVA" : isNewCustomer === false ? "CLIENTE RECORRENTE" : "Cliente"}${isNewCustomer === false ? " - Tem histórico de atendimentos, pode personalizar conversa lembrando preferências anteriores" : ""}${noShowWarning}`
    }
  } else if (customerId) {
    return `\n\nINFORMAÇÃO DO CLIENTE:
- Tipo: ${isNewCustomer === true ? "CLIENTE NOVA" : isNewCustomer === false ? "CLIENTE RECORRENTE" : "Cliente"}
- O customerId é: ${customerId}${noShowWarning}`
  }

  return ""
}

/**
 * Formata data e hora atual
 */
function formatDateTime(): { formattedDate: string; formattedTime: string } {
  const now = new Date()

  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const formattedDate = dateFormatter.format(now)

  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const formattedTime = timeFormatter.format(now)

  return { formattedDate, formattedTime }
}

export class SystemPromptBuilder {
  /**
   * Cria system prompt padrão para assistente de salão
   * OTIMIZADO: Aceita agentInfo para evitar query duplicada
   */
  static async build(
    salonId: string,
    preferences?: Record<string, unknown>,
    knowledgeContext?: string,
    customerName?: string,
    customerId?: string,
    isNewCustomer?: boolean,
    existingAgentInfo?: Awaited<ReturnType<typeof AgentInfoService.getActiveAgentInfo>>,
    noShowRisk?: { isHighRisk: boolean; cancellationRatio: number },
    soloProfessional?: { id: string; name: string } | null
  ): Promise<string> {
    // Usa agentInfo passado ou busca (evita duplicação)
    const agentInfo = existingAgentInfo ?? await AgentInfoService.getActiveAgentInfo(salonId)
    const { formattedDate, formattedTime } = formatDateTime()
    const preferencesText = formatPreferencesText(preferences)
    const knowledgeContextText = formatKnowledgeContextText(knowledgeContext)
    const customerInfoText = formatCustomerInfoText(customerName, customerId, isNewCustomer, noShowRisk)

    // Query única para settings do salão (removida duplicação)
    const salonInfo = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { settings: true },
    })
    const salonSettings = (salonInfo?.settings as Record<string, unknown>) || {}
    const toleranceMinutes = salonSettings.late_tolerance_minutes as number | undefined
    const salonInfoText = toleranceMinutes !== undefined
      ? `\n\nCONFIGURAÇÕES DO SALÃO:\n- Tolerância para atrasos: ${toleranceMinutes} minutos`
      : ""

    const soloProfessionalText = soloProfessional
      ? `\n\nPROFISSIONAL ÚNICO DO SALÃO:
- Nome: ${soloProfessional.name}
- ID interno: ${soloProfessional.id}
- REGRA: Este salão tem apenas 1 profissional. NUNCA pergunte qual profissional o cliente prefere. Use automaticamente "${soloProfessional.name}" (ID: ${soloProfessional.id}) em TODAS as chamadas que precisam de professionalId (checkAvailability, addAppointment). NÃO chame getProfessionals.`
      : ""

    const bookingFlow = soloProfessional
      ? `FLUXO DE AGENDAMENTO (siga na ordem):
1. Saudação → Cumprimente pelo nome (se disponível). Pergunte como pode ajudar.
2. Cliente pergunta serviços/preços → Chame getServices. Apresente nome e preço de forma natural. Pergunte qual deseja.
3. Cliente escolheu serviço → Pergunte "Para qual dia gostaria de agendar?"
4. Cliente informou data → Chame checkAvailability (inclua serviceId e professionalId: ${soloProfessional.id}). Ofereça 2-3 horários disponíveis.
5. Cliente escolheu horário → Chame addAppointment com professionalId (${soloProfessional.id}), serviceId e data/hora. Confirme com resumo: serviço, dia e horário.`
      : `FLUXO DE AGENDAMENTO (siga na ordem):
1. Saudação → Cumprimente pelo nome (se disponível). Pergunte como pode ajudar.
2. Cliente pergunta serviços/preços → Chame getServices. Apresente nome e preço de forma natural. Pergunte qual deseja.
3. Cliente escolheu serviço → Pergunte "Para qual dia gostaria de agendar?"
4. Cliente informou data → Chame checkAvailability (inclua serviceId obtido no passo 2). Ofereça 2-3 horários disponíveis.
5. Cliente escolheu horário → Chame addAppointment com professionalId, serviceId e data/hora. Confirme com resumo: serviço, profissional, dia e horário.`

    return `Você é ${agentInfo?.name}, assistente virtual de agendamentos via WhatsApp.
Tom: ${agentInfo?.tone}. Objetivo: converter conversas em agendamentos confirmados.

HOJE: ${formattedDate} | HORA: ${formattedTime}
Use como referência absoluta para "amanhã", "sábado que vem", etc.${customerInfoText}${preferencesText}${salonInfoText}${soloProfessionalText}${knowledgeContextText}

REGRAS DE TOOLS (OBRIGATÓRIO):
- NUNCA invente serviços, preços, profissionais ou horários. SEMPRE consulte via tool antes de informar qualquer dado.
- IDs são internos do sistema. NUNCA mencione IDs, UUIDs ou códigos técnicos na resposta ao cliente.
- Chame UMA tool de cada vez, na ordem correta. Espere o resultado antes de chamar a próxima.
- NUNCA chame addAppointment sem antes confirmar disponibilidade via checkAvailability.
- NUNCA chame checkAvailability sem o cliente ter informado uma DATA específica. Sem data → pergunte "Para qual dia?".
- NUNCA chame updateAppointment ou removeAppointment sem antes listar com getMyFutureAppointments.
- Se uma tool retornar erro, NÃO tente a mesma tool novamente. Peça ao cliente para reformular ou tente outra abordagem.
- Ao receber resultados de tools, extraia apenas nome, preço, horário e data. Ignore campos técnicos.

${bookingFlow}

FLUXO DE REAGENDAMENTO:
1. Cliente quer reagendar → Chame getMyFutureAppointments.
2. Mostre agendamentos numerados (1, 2, 3...) com serviço, profissional e data. SEM IDs. Pergunte qual deseja reagendar.
3. Cliente escolheu → Pergunte nova data desejada.
4. Com nova data → Chame checkAvailability. Ofereça horários.
5. Cliente escolheu horário → Chame updateAppointment. Confirme alteração.

FLUXO DE CANCELAMENTO:
1. Cliente quer cancelar → Chame getMyFutureAppointments.
2. Mostre agendamentos numerados. SEM IDs. Pergunte qual deseja cancelar.
3. Cliente confirmou → Chame removeAppointment. Confirme cancelamento.

FORMATO DE RESPOSTAS:
- Máximo 3 frases por mensagem. Seja direto e cordial.
- No máximo 3 opções de horário por vez.
- Use o nome do cliente quando disponível.
- Sem markdown excessivo. Sem listas longas. Linguagem conversacional de WhatsApp.
- Despedida/negação ("Não", "Obrigado", "Tchau"): responda cordialmente, ZERO tool calls.
- A agenda SEMPRE existe. NUNCA diga que está inacessível. Em erro técnico, peça dia/horário e continue.

${agentInfo?.systemPrompt || ""}`
  }
}

// Export function for backward compatibility
export async function createSalonAssistantPrompt(
  salonId: string,
  preferences?: Record<string, unknown>,
  knowledgeContext?: string,
  customerName?: string,
  customerId?: string,
  isNewCustomer?: boolean,
  agentInfo?: Awaited<ReturnType<typeof AgentInfoService.getActiveAgentInfo>>,
  noShowRisk?: { isHighRisk: boolean; cancellationRatio: number },
  soloProfessional?: { id: string; name: string } | null
): Promise<string> {
  return SystemPromptBuilder.build(
    salonId,
    preferences,
    knowledgeContext,
    customerName,
    customerId,
    isNewCustomer,
    agentInfo,
    noShowRisk,
    soloProfessional
  )
}
