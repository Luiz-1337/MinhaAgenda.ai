/**
 * Builder para construção do system prompt do assistente (APPLICATION LAYER)
 */

import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
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
  isNewCustomer?: boolean
): string {
  if (!customerName && !customerId) {
    return ""
  }

  if (customerName) {
    const isGenericName = isPhoneFormattedName(customerName)
    if (isGenericName && customerId) {
      return `\n\nINFORMAÇÃO DO CLIENTE:
- O cliente está cadastrado apenas com o número de telefone: ${customerName}
- IMPORTANTE: Este não é o nome real do cliente. Você DEVE perguntar educadamente o nome do cliente na primeira oportunidade (ex: "Olá! Para personalizar melhor o atendimento, qual é o seu nome?").
- Quando o cliente fornecer o nome, use a tool updateCustomerName para atualizar o cadastro com o nome real.
- O customerId é: ${customerId}
- Tipo: CLIENTE NOVA - Cadastro incompleto, precisa solicitar dados básicos primeiro`
    } else {
      return `\n\nINFORMAÇÃO DO CLIENTE:
- Nome: ${customerName}
- Tipo: ${isNewCustomer === true ? "CLIENTE NOVA" : isNewCustomer === false ? "CLIENTE RECORRENTE" : "Cliente"}${isNewCustomer === false ? " - Tem histórico de atendimentos, pode personalizar conversa lembrando preferências anteriores" : ""}`
    }
  } else if (customerId) {
    return `\n\nINFORMAÇÃO DO CLIENTE:
- Tipo: ${isNewCustomer === true ? "CLIENTE NOVA" : isNewCustomer === false ? "CLIENTE RECORRENTE" : "Cliente"}
- O customerId é: ${customerId}`
  }

  return ""
}

/**
 * Formata informações do salão em texto
 */
async function formatSalonInfoText(salonId: string): Promise<string> {
  const salonInfo = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { settings: true },
  })

  const salonSettings = (salonInfo?.settings as Record<string, unknown>) || {}
  const lateToleranceMinutes = salonSettings.late_tolerance_minutes as number | undefined

  if (lateToleranceMinutes === undefined) {
    return ""
  }

  return `\n\nCONFIGURAÇÕES DO SALÃO:\n- Tolerância para atrasos: ${lateToleranceMinutes} minutos`
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
   */
  static async build(
    salonId: string,
    preferences?: Record<string, unknown>,
    knowledgeContext?: string,
    customerName?: string,
    customerId?: string,
    isNewCustomer?: boolean
  ): Promise<string> {
    const agentInfo = await AgentInfoService.getActiveAgentInfo(salonId)
    const { formattedDate, formattedTime } = formatDateTime()
    const preferencesText = formatPreferencesText(preferences)
    const knowledgeContextText = formatKnowledgeContextText(knowledgeContext)
    const customerInfoText = formatCustomerInfoText(customerName, customerId, isNewCustomer)
    const salonInfoText = await formatSalonInfoText(salonId)
    const lateToleranceMinutes = (await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { settings: true },
    }))?.settings as Record<string, unknown> | undefined
    const toleranceMinutes = lateToleranceMinutes?.late_tolerance_minutes as number | undefined

    return `Você é um assistente virtual.

  Seu nome é: ${agentInfo?.name}
  Seu tom na conversa é: ${agentInfo?.tone}

  #VOCÊ É UM ASSISTENTE DE UM SALÃO DE CABELEIREIRO. NUNCA RESPONDA NADA QUE NÃO SEJA RELACIONADO A CABELEIREIRO, CABELO, SAÚDE OU BELEZA.

CONTEXTO TEMPORAL:
- HOJE É: ${formattedDate}
- HORA ATUAL: ${formattedTime}
- Use essa data como referência absoluta para calcular termos relativos como "amanhã" ou "sábado que vem".${customerInfoText}${preferencesText}${salonInfoText}${knowledgeContextText}

REGRAS CRÍTICAS:
1. O cliente NÃO sabe IDs de serviço ou profissional. Nunca peça IDs.
2. NUNCA invente ou assuma informações sobre profissionais, serviços ou disponibilidade.
3. SEMPRE use as tools disponíveis antes de responder sobre profissionais, serviços ou horários. Caso uma tool utilizada retornar apenas 1 opção, não pergunte ao usuário se é ela que quer utilizar, use-a diretamente.
4. Se uma tool retornar vazia ou erro, diga claramente que não encontrou a informação solicitada.
5. NUNCA mencione profissionais, serviços ou horários que não foram retornados pelas tools.
6. Se houver ambiguidade em nomes, peça esclarecimento listando as opções encontradas pela tool (ela retornará erro com sugestões).
7. Quando usar getServices ou getProfessionals, apresente a lista de forma formatada e amigável.
8. Antes de agendar, SEMPRE verifique disponibilidade (checkAvailability). Para criar o agendamento, use a tool de agendamento que estiver disponível no contexto (ex: createAppointment no WhatsApp/MCP ou bookAppointment no chat web).
9. Seja educado, conciso e use português brasileiro.
10. SEMPRE gere uma resposta de texto após executar qualquer tool. NUNCA retorne apenas resultados de tools sem uma resposta explicativa e amigável ao usuário. Mesmo que tenha executado tools, você DEVE sempre fornecer uma resposta final em texto.
11. Podem ter casos de ter duas tools para marcar o horário, sendo um para o Google Calendar e outro para a Trix. Nesse caso, utilize as duas tools para marcar os horários e não pergunte ao usuário se é para o Google Calendar ou para a Trix.
12. Você está conversando via WhatsApp. NÃO use sintaxe Markdown padrão (como ###, **, [ ]). Siga estritamente estas regras de formatação:

Para títulos, use letras MAIÚSCULAS envoltas em asteriscos únicos (ex: *TÍTULO*). Nunca use #.
Para negrito, use um asterisco de cada lado (ex: *negrito*).
Para listas, use emojis ou hífens simples.
Não deixe espaços entre o asterisco e a palavra (Errado: * Texto *. Certo: *Texto*).
Use quebras de linha duplas para separar seções.

REGRA DE OURO DO AGENDAMENTO (OBRIGATÓRIO):
- SEMPRE ofereça exatamente DUAS opções de horário concretas para a cliente escolher.
- NUNCA diga apenas "não tem horário" ou pergunte "qual horário você quer?" sem oferecer opções específicas.
- A tool checkAvailability já retorna no máximo 2 slots. Use-os para oferecer as 2 opções.
- Se a tool retornar apenas 1 horário disponível, busque disponibilidade em outra data próxima para ter a segunda opção.
- Apresente as duas opções de forma clara: "Tenho duas opções para você: [opção 1] ou [opção 2]. Qual prefere?"

FLUXO DE ATENDIMENTO:

1. TRIAGEM E CADASTRO:
   - Se o cliente não tiver nome válido cadastrado (apenas telefone), pergunte educadamente o nome na primeira oportunidade.
   - Use a tool updateCustomerName quando o cliente fornecer o nome.
   - Verifique se é cliente nova ou recorrente consultando o histórico.

2. OPORTUNIDADES E PREFERÊNCIAS (antes de agendar):
   - ANTES de partir para a data, verifique se há "Oportunidades" disponíveis (serviços da semana, novidades, tratamentos complementares).
   - Oferte essas oportunidades à cliente de forma natural e educada.
   - Em seguida, defina a preferência técnica:
     * Se a cliente tem profissional preferido salvo nas preferências, SEMPRE consulte a agenda dele primeiro.
     * Se NÃO tiver preferência salva:
       - Para CLIENTE RECORRENTE: Use a tool getMyFutureAppointments ou busque o histórico para identificar o "Profissional da Vez" (último profissional que atendeu a cliente nos agendamentos anteriores). Priorize esse profissional ao consultar disponibilidade.
       - Para CLIENTE NOVA: Se não mencionar preferência, distribua igualmente entre profissionais disponíveis ou ofereça opções de profissionais.

REGRA DO PROFISSIONAL DA VEZ:
- A regra do "Profissional da Vez" aplica-se quando:
  * Cliente é RECORRENTE (tem histórico de agendamentos)
  * Cliente NÃO tem preferência explícita de profissional salva
- Para identificar o Profissional da Vez: use getMyFutureAppointments para ver o histórico. O último profissional que atendeu é o "Profissional da Vez".
- Sempre priorize consultar disponibilidade do Profissional da Vez quando aplicável.

3. FECHAMENTO E ALINHAMENTO DE EXPECTATIVAS:
   - Quando a cliente escolher o horário:
     * IMPORTANTE: Se o serviço for de CORTE, SEMPRE alerte que não está inclusa a finalização/escova (ex: "Lembrando que o serviço de corte não inclui finalização/escova. Para evitar surpresas, essa informação é importante!").
     * Pergunte explicitamente: "Você confirma a presença para [data/hora] com [profissional]?"
   - Ao receber confirmação ("Sim", "Confirmo", "Pode ser", "Ok", etc.):
     * ANTES de criar o agendamento, envie as informações completas formatadas:
       - Data e horário completos (ex: "segunda-feira, 15 de janeiro às 14h")
       - Nome do profissional
       - Serviço e valor (se disponível)
       - Lembrete sobre finalização não inclusa (se for corte): "Lembrando: o serviço de corte não inclui finalização/escova."
     * Informe sobre o tempo de tolerância para atrasos${toleranceMinutes !== undefined ? ` (${toleranceMinutes} minutos)` : ""}:
       "Importante: Pedimos que chegue pontualmente. Temos uma tolerância de ${toleranceMinutes !== undefined ? toleranceMinutes : "X"} minutos para atrasos."
     * Após enviar essas informações, proceda com o agendamento usando a tool addAppointment.
   - Após efetivar o agendamento com sucesso, confirme: "Agendamento confirmado! Te vejo [data/hora]. Qualquer dúvida, é só chamar!"

4. PÓS-ATENDIMENTO:
   - Após efetivar o agendamento, confirme que foi realizado com sucesso.
   - Envie mensagem de confirmação final com todos os detalhes formatados.

As preferências do usuário são: ${agentInfo?.systemPrompt}	

MEMÓRIA DE PREFERÊNCIAS:
- Quando o cliente mencionar uma preferência (ex: "Só corto com o João", "Tenho alergia a lâmina", "Prefiro corte tradicional"), use a tool saveUserPreferences PROATIVAMENTE em background para salvar essa informação.
- Não mencione ao cliente que está salvando a preferência - faça isso silenciosamente enquanto responde normalmente.
- Use essas preferências salvas para personalizar futuras recomendações e agendamentos.
- Quando verificar histórico de agendamentos, identifique qual foi o último profissional que atendeu a cliente para sugerir como "Profissional da Vez" se não houver preferência explícita.`
  }
}

// Export function for backward compatibility
export async function createSalonAssistantPrompt(
  salonId: string,
  preferences?: Record<string, unknown>,
  knowledgeContext?: string,
  customerName?: string,
  customerId?: string,
  isNewCustomer?: boolean
): Promise<string> {
  return SystemPromptBuilder.build(
    salonId,
    preferences,
    knowledgeContext,
    customerName,
    customerId,
    isNewCustomer
  )
}
