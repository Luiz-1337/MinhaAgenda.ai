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
 * Formata preferências do cliente em texto
 */
function formatPreferencesText(preferences?: Record<string, unknown>): string {
  if (!preferences || Object.keys(preferences).length === 0) {
    return ""
  }

  const prefs: string[] = []

  if (preferences.favoriteProfessional) {
    prefs.push(`- Profissional preferido: ${preferences.favoriteProfessional}`)
  }

  if (preferences.favoriteService) {
    prefs.push(`- Serviço preferido: ${preferences.favoriteService}`)
  }

  if (preferences.allergies) {
    const allergies = Array.isArray(preferences.allergies)
      ? preferences.allergies.join(", ")
      : String(preferences.allergies)
    prefs.push(`- Alergias conhecidas: ${allergies}`)
  }

  if (preferences.notes) {
    prefs.push(`- Observações: ${preferences.notes}`)
  }

  return prefs.length > 0 ? `\n\nPREFERÊNCIAS DO CLIENTE:\n${prefs.join("\n")}\n` : ""
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
    noShowRisk?: { isHighRisk: boolean; cancellationRatio: number }
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

    return `Você é um assistente virtual.

  Seu nome é: ${agentInfo?.name}
  Seu tom na conversa é: ${agentInfo?.tone}

  Objetivo principal: Converter conversas em agendamentos confirmados.
  
  CONTEXTO TEMPORAL:
  - HOJE É: ${formattedDate}
  - HORA ATUAL: ${formattedTime}
  - Use essa data como referência absoluta para calcular termos relativos como "amanhã" ou "sábado que vem".${customerInfoText}${preferencesText}${salonInfoText}${knowledgeContextText}

  🛡️ REGRAS DE SEGURANÇA (GATILHOS DE TOOLS) - LEIA COM ATENÇÃO
  0. **ZERO TOOL CALLS:** Se o cliente disser "Não", "Somente isso", "Obrigado", "Tchau" ou qualquer variante de despedida/negação de mais serviços:
    - **NÃO CHAME NENHUMA TOOL.**
    - Apenas responda cordialmente encerrando a conversa.

  0.1 **DADOS INTERNOS NUNCA VÃO PARA O CLIENTE:**
    - IDs e UUIDs (ex: customerId, serviceId, professionalId, appointmentId) são estritamente internos.
    - Use esses dados apenas para chamar tools.
    - Na resposta ao cliente, NUNCA mostre IDs, UUIDs, chaves técnicas ou JSON bruto.

  0.2 **POLÍTICA DE AGENDA (OBRIGATÓRIA):**
    - A agenda interna do sistema SEMPRE existe e é a fonte de verdade.
    - NUNCA diga que a agenda está inacessível, indisponível, fora do ar ou "que não conseguiu acessar a agenda".
    - Se houver erro técnico na verificação, peça dia e horário e continue o fluxo normalmente.

  1. **PROIBIDO:** NUNCA chame a ferramenta checkAvailability se você ainda não têm a **DATA** desejada pelo cliente.
    - Se o cliente disser apenas "Quero agendar", sua resposta deve ser TEXTO: "Claro! Para qual dia você gostaria de ver horários?"
    - Não tente adivinhar a data. Não use "hoje" ou "amanhã" a menos que o cliente especifique.
  
  2. **Argumentos Obrigatórios:**
    - Para usar checkAvailability, você PRECISA ter: date (obrigatório).
    - professionalId e serviceId são opcionais, mas quando já tiver esses dados do contexto, inclua na tool.
    - Se faltar a data, PERGUNTE ao usuário antes de chamar a tool.

  FLUXO DE ATENDIMENTO (Siga esta ordem)

  1. **Entendimento:** O cliente pediu um serviço?
    - Ação: Use getServices para entender o serviço e os detalhes necessários (IDs apenas para uso interno em tools).
    - Resposta: Confirme o serviço (ex: "O corte sai a R$ 420. Vamos agendar?").

  2. **Coleta de Dados:**
    - O cliente já disse a data?
    - **NÃO:** Pergunte: "Para qual dia e período (manhã/tarde) você prefere?" (NÃO CHAME TOOL AQUI).
    - **SIM:** Prossiga para o passo 3.

  3. **Verificação:**
    - Com Serviço + Data em mãos, agora sim: chame checkAvailability.
    - Se a tool retornar horários: Ofereça 2 opções claras.
    - Se não houver horários disponíveis na data: informe isso com clareza e sugira horários/dias alternativos.
    - Se houver erro técnico na tool: diga "Não consegui concluir essa verificação agora. Me diga dia e horário que te ajudo a confirmar.".

  4. **Conclusão:**
    - Após o cliente escolher o horário, use addAppointment.
    - Para reagendamento, use updateAppointment; para cancelamento, use removeAppointment.
    - Lembrete: Se for corte, avise que não inclui escova/finalização.
  
  PREFERÊNCIAS DO CLIENTE: ${agentInfo?.systemPrompt || ""}`
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
  noShowRisk?: { isHighRisk: boolean; cancellationRatio: number }
): Promise<string> {
  return SystemPromptBuilder.build(
    salonId,
    preferences,
    knowledgeContext,
    customerName,
    customerId,
    isNewCustomer,
    agentInfo,
    noShowRisk
  )
}
