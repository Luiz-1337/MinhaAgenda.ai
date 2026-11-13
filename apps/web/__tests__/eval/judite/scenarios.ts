/**
 * Os ajustes pedidos pelo cliente (Fabiano Eber), cada um testado com a MENSAGEM
 * REAL que gerou o problema — conversas do Spettacolo Salone, 04 a 12/nov/2026.
 *
 * As falas das clientes estão como foram escritas (erros de digitação
 * inclusive). Só mudam as DATAS, porque as originais já passaram (onde a cliente
 * escreveu "19nov", o cenário escreve a data equivalente a partir de hoje), e o
 * sobrenome na fala em que a cliente informa o nome completo, que é fictício.
 *
 * Nenhum dado de cliente além do texto da mensagem está aqui: nomes completos e
 * telefones são de teste. Dos nomes reais só ficaram o primeiro nome e o nome de
 * perfil, que era o próprio problema ("Sil").
 */

import type { ResponsesRunnerStep } from "@/lib/services/ai/openai-responses-runner.service"
import type { Conversation } from "../types"
import type { FakeBelasis } from "./fake-belasis"
import {
  FAKE_EMPLOYEE_ID,
  FAKE_TRAFFIC_COLOR_ID,
  HIDRATACAO_TEST_PRICE,
  loadActiveAppointments,
  loadCustomer,
  resetFakeBelasis,
  type JuditeEvalContext,
} from "./setup"

export interface JuditeScenario {
  /** Item da lista do cliente que o cenário cobre. */
  item: string
  name: string
  description: string
  build: (ctx: JuditeEvalContext) => Conversation
}

// ----------------------------------------------------------------------------
// Padrões de texto
// ----------------------------------------------------------------------------

/** A frase de transferência — o que ela respondia para o que agora sabe responder. */
const TRANSFERENCIA = /Vou avisar o Fabiano|Fabiano j[aá] foi avisado/i
const NOME_ANTIGO = /Juditi/i
/** Preço do corte por tamanho de cabelo, ou "confirma na avaliação". */
const CORTE_POR_TAMANHO = [/R\$\s?560/, /cabelo (curto|m[eé]dio|longo)/i, /(curto|m[eé]dio) ou longo/i, /confirma.{0,40}avalia[cç][aã]o/i]
const CORTE_MASCULINO = /masculino/i
const PEDE_O_NOME = /nome completo|sobrenome|seu nome|nome e sobrenome/i
const DIZ_QUE_NAO_ACHOU = [/n[ãa]o encontrei/i, /nenhum agendamento/i, /n[ãa]o (h[aá]|tem|possui) agendamento/i]

// ----------------------------------------------------------------------------
// Datas a partir de hoje (fuso de Brasília)
// ----------------------------------------------------------------------------

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

interface Dia {
  /** "2026-11-19" */
  iso: string
  /** "19/11" */
  ddMM: string
  /** "19nov", como a cliente escreveu. */
  diaMes: string
}

function hojeEmBrasilia(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  return new Date(`${iso}T12:00:00Z`)
}

/** O primeiro dia, a partir de hoje + `aPartirDe`, que cai num dos dias da semana (0 = domingo). */
function proximoDia(diasDaSemana: number[], aPartirDe: number): Dia {
  const date = hojeEmBrasilia()
  date.setUTCDate(date.getUTCDate() + aPartirDe)
  while (!diasDaSemana.includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
  const iso = date.toISOString().slice(0, 10)
  const [, month, day] = iso.split("-") as [string, string, string]
  return { iso, ddMM: `${day}/${month}`, diaMes: `${Number(day)}${MESES[Number(month) - 1]}` }
}

function maisDias(dia: Dia, dias: number): Dia {
  const date = new Date(`${dia.iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dias)
  const iso = date.toISOString().slice(0, 10)
  const [, month, day] = iso.split("-") as [string, string, string]
  return { iso, ddMM: `${day}/${month}`, diaMes: `${Number(day)}${MESES[Number(month) - 1]}` }
}

/** Terça a sexta: os dias em que o Fabiano atende das 9h às 18h. */
const DIAS_UTEIS = [2, 3, 4, 5]

// ----------------------------------------------------------------------------
// Leitura das tools chamadas num turno
// ----------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value))
    } catch {
      return null
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

/** A tool foi chamada E deu certo (não voltou erro)? */
function toolSucceeded(steps: ResponsesRunnerStep[], toolName: string): boolean {
  return steps.some((step) =>
    (step.toolResults ?? []).some((result) => {
      if (result.toolName !== toolName || result.isError || result.error) return false
      return asRecord(result.result)?.error !== true
    })
  )
}

/** A conversa foi mandada para a coluna "Atenção" (transferência para o Fabiano)? */
function movedToAttention(steps: ResponsesRunnerStep[]): boolean {
  return steps.some((step) =>
    (step.toolCalls ?? []).some(
      (call) => call.toolName === "setChatKanbanColumn" && asRecord(call.input)?.category === "attention"
    )
  )
}

const semTransferencia = (_result: unknown, steps: ResponsesRunnerStep[]) =>
  movedToAttention(steps) ? 'mandou a conversa para "Atenção" em vez de responder sozinha' : null

/** Quantos valores em reais a resposta cita. */
const countPrices = (text: string) => (text.match(/R\$/g) ?? []).length

// ----------------------------------------------------------------------------
// Cenários
// ----------------------------------------------------------------------------

/** Cliente nova que chegou por anúncio, com o apelido do perfil do WhatsApp. */
const leadDeAnuncio = {
  isNewCustomer: true,
  leadSource: "paid_traffic" as const,
  adReferral: {
    sourceType: "ad",
    sourceId: "120240000000000001",
    headline: "Corte em Alta Definição com Fabiano Eber",
    ctwaClid: "clid_eval",
  },
}

export const JUDITE_SCENARIOS: JuditeScenario[] = [
  {
    item: "1, 4, 13 e 14",
    name: "nome_completo_antes_do_cadastro",
    description:
      'Conversa da "Sil" (07/nov): pede o nome completo antes de agendar; o cadastro na agenda sai com o nome informado, e o agendamento de tráfego leva a cor',
    build: (ctx) => {
      let fake: FakeBelasis
      let askedName = false
      let bookedBeforeName = false

      /** Em todo turno antes de ela informar o nome: perguntou? agendou sem perguntar? */
      const watch = (result: { text: string }, steps: ResponsesRunnerStep[]) => {
        if (PEDE_O_NOME.test(result.text)) askedName = true
        if (toolSucceeded(steps, "addAppointment")) bookedBeforeName = true
        return bookedBeforeName ? "agendou sem ter o nome completo da cliente" : null
      }

      return {
        name: "nome_completo_antes_do_cadastro",
        description: "Pede nome e sobrenome antes de criar o cadastro; nunca usa o nome do perfil",
        context: { customerName: "Sil", ...leadDeAnuncio },
        prepare: () => {
          fake = resetFakeBelasis(ctx) // ela ainda não existe na agenda do salão
        },
        turns: [
          {
            user: "Quero agendar um horário!",
            expect: {
              text: { mustMatchAll: [/Judite/], mustNotMatch: [NOME_ANTIGO] },
              custom: watch,
            },
          },
          { user: "Corte", expect: { text: { mustNotMatch: [CORTE_MASCULINO] }, custom: watch } },
          { user: "Feminino", expect: { custom: watch } },
          { user: "Sábado", expect: { custom: watch } },
          {
            user: "11h por favor",
            expect: {
              custom: (result, steps) =>
                watch(result, steps) ??
                (askedName ? null : "a cliente escolheu o horário e ninguém perguntou o nome completo dela"),
            },
          },
          {
            user: "Silvana Prado Lima",
            expect: {
              tools: {
                required: ["updateCustomerName", "addAppointment"],
                args: { updateCustomerName: { matches: { name: /Silvana Prado Lima/i } } },
              },
              custom: (_result, steps) =>
                toolSucceeded(steps, "addAppointment") ? null : "o nome foi informado e o agendamento não saiu",
            },
          },
        ],
        verify: async (run) => {
          const failures: string[] = []

          const names = fake.state.clients.map((c) => c.name)
          if (names.length !== 1) failures.push(`esperava 1 cadastro na agenda do salão, achei ${names.length}: ${names.join(", ")}`)
          if (names.some((name) => /^sil$/i.test(name.trim()))) failures.push('o cadastro foi criado com o nome do perfil ("Sil")')
          if (!names.some((name) => /Silvana Prado Lima/i.test(name))) failures.push(`o cadastro não tem o nome informado: ${names.join(", ")}`)

          const groups = fake.state.groups
          if (groups.length !== 1) failures.push(`esperava 1 agendamento na agenda do salão, achei ${groups.length}`)
          if (groups[0] && groups[0].schedule_color_id !== FAKE_TRAFFIC_COLOR_ID) {
            failures.push(`lead de tráfego: o agendamento devia levar a cor ${FAKE_TRAFFIC_COLOR_ID}, levou ${groups[0].schedule_color_id}`)
          }

          const customer = await loadCustomer(run.customerId)
          if (!customer?.nameConfirmedAt) failures.push("o nome informado não ficou marcado como confirmado no cliente")
          if (customer?.leadSource !== "paid_traffic") failures.push(`origem do cliente: esperava paid_traffic, achei ${customer?.leadSource}`)

          const booked = await loadActiveAppointments(run.salonId, run.customerId)
          if (booked.length !== 1) failures.push(`esperava 1 agendamento aqui, achei ${booked.length}`)
          if (booked[0] && booked[0].leadSource !== "paid_traffic") {
            failures.push(`origem do agendamento: esperava paid_traffic, achei ${booked[0].leadSource}`)
          }
          return failures
        },
      }
    },
  },

  {
    item: "2",
    name: "reagendar_horario_marcado_pela_recepcao",
    description:
      'Conversa de 12/nov ("vou precisar reagendar o corte"): enxerga o horário marcado pela recepção e REMARCA, sem criar outro nem um segundo cadastro',
    build: (ctx) => {
      let fake: FakeBelasis
      const original = proximoDia([2], 4) // uma terça
      const novo = maisDias(original, 2) // a quinta da mesma semana
      const semNovoAgendamento = (_result: unknown, steps: ResponsesRunnerStep[]) =>
        toolSucceeded(steps, "addAppointment") ? "criou um agendamento NOVO em vez de remarcar o que já existia" : null

      return {
        name: "reagendar_horario_marcado_pela_recepcao",
        description: "Remarca o horário que a recepção marcou direto na agenda do salão",
        context: { customerName: "Fernanda", isNewCustomer: false, leadSource: "organic" },
        prepare: (run) => {
          fake = resetFakeBelasis(ctx, {
            // A recepção guarda o telefone sem o DDI.
            clients: [{ id: 88, name: "Fernanda Lima Duarte", cellphone: run.clientPhone.replace(/^55/, ""), active: true }],
            groups: [
              {
                id: 610,
                client_id: 88,
                status: "unconfirmed",
                date: original.iso,
                calendars: [
                  {
                    id: 9100,
                    inventory_product_id: ctx.fakeServiceIds.get(ctx.corteFemininoId) ?? 0,
                    employee_id: FAKE_EMPLOYEE_ID,
                    start_hour: "17:00",
                    end_hour: "18:00",
                  },
                ],
              },
            ],
          })
        },
        turns: [
          {
            user: `Olá boa tarde, vou precisar reagendar o corte para dia ${novo.diaMes}. O Fabiano tem disponibilidade? Poderia ser mais cedo...`,
            expect: { text: { mustNotMatch: DIZ_QUE_NAO_ACHOU }, custom: semNovoAgendamento },
          },
          { user: "Ou às 17h mesmo", expect: { text: { mustNotMatch: DIZ_QUE_NAO_ACHOU }, custom: semNovoAgendamento } },
          { user: "Pode ser, feminino", expect: { custom: semNovoAgendamento } },
        ],
        verify: async (run) => {
          const failures: string[] = []

          if (fake.state.clients.length !== 1) {
            failures.push(`foi criado um segundo cadastro na agenda do salão: ${fake.state.clients.map((c) => c.name).join(", ")}`)
          }
          const active = fake.activeGroupsOf(88)
          if (active.length !== 1) {
            failures.push(`a cliente devia ter 1 horário ativo na agenda do salão, tem ${active.length} (${active.map((g) => g.date).join(", ")})`)
          }
          if (active.some((g) => g.date === original.iso)) failures.push(`o horário original (${original.ddMM}) continuou ativo`)
          if (!active.some((g) => g.date === novo.iso)) failures.push(`não há horário no dia pedido (${novo.ddMM})`)
          // Lead orgânico não leva a cor de tráfego.
          if (active.some((g) => g.schedule_color_id === FAKE_TRAFFIC_COLOR_ID)) failures.push("lead orgânico saiu com a cor de tráfego")

          const booked = await loadActiveAppointments(run.salonId, run.customerId)
          if (booked.length !== 1) failures.push(`esperava 1 agendamento ativo aqui, achei ${booked.length}`)
          return failures
        },
      }
    },
  },

  {
    item: "2",
    name: "marcar_para_outro_dia_quem_ja_tem_horario",
    description:
      'Conversa de 10/nov ("Gostaria de marcar para outro dia"): o horário era da recepção; não cria um segundo, remarca',
    build: (ctx) => {
      let fake: FakeBelasis
      const original = proximoDia(DIAS_UTEIS, 1)
      const novo = proximoDia(DIAS_UTEIS, 14)
      const semNovoAgendamento = (_result: unknown, steps: ResponsesRunnerStep[]) =>
        toolSucceeded(steps, "addAppointment") ? "criou um agendamento NOVO em vez de remarcar o que já existia" : null

      return {
        name: "marcar_para_outro_dia_quem_ja_tem_horario",
        description: "Quem já tem horário marcado pela recepção e pede outro dia é remarcada",
        context: { customerName: "Marcia", isNewCustomer: false, leadSource: "organic" },
        prepare: (run) => {
          fake = resetFakeBelasis(ctx, {
            clients: [{ id: 77, name: "Márcia Tavares Pinto", cellphone: run.clientPhone, active: true }],
            groups: [
              {
                id: 620,
                client_id: 77,
                status: "unconfirmed",
                date: original.iso,
                calendars: [
                  {
                    id: 9200,
                    inventory_product_id: ctx.fakeServiceIds.get(ctx.corteFemininoId) ?? 0,
                    employee_id: FAKE_EMPLOYEE_ID,
                    start_hour: "14:00",
                    end_hour: "15:00",
                  },
                ],
              },
            ],
          })
        },
        turns: [
          { user: "Bom dia! Eu esqueci que tenho um exame às 13:30 hr", expect: { custom: semNovoAgendamento } },
          {
            user: "Gostaria de marcar para outro dia",
            expect: { text: { mustNotMatch: DIZ_QUE_NAO_ACHOU }, custom: semNovoAgendamento },
          },
          { user: `Dia ${novo.ddMM} você teria as 14:00 hr`, expect: { custom: semNovoAgendamento } },
          { user: "Cortar o cabelo com o Fabiano", expect: { custom: semNovoAgendamento } },
        ],
        verify: () => {
          const failures: string[] = []
          if (fake.state.clients.length !== 1) {
            failures.push(`foi criado um segundo cadastro na agenda do salão: ${fake.state.clients.map((c) => c.name).join(", ")}`)
          }
          const active = fake.activeGroupsOf(77)
          if (active.length !== 1) failures.push(`a cliente devia ter 1 horário ativo, tem ${active.length} (${active.map((g) => g.date).join(", ")})`)
          if (active.some((g) => g.date === original.iso)) failures.push(`o horário original (${original.ddMM}) continuou ativo`)
          if (!active.some((g) => g.date === novo.iso)) failures.push(`não há horário no dia pedido (${novo.ddMM})`)
          return failures
        },
      }
    },
  },

  {
    item: "3, 4 e 9",
    name: "preco_do_corte",
    description:
      'Conversa de 07/nov ("Qual valor corte"): R$ 450, sem tamanho de cabelo, sem "confirma na avaliação" e sem citar o corte masculino',
    build: (ctx) => ({
      name: "preco_do_corte",
      description: "Corte feminino: valor único de R$ 450",
      context: { customerName: "Gi", ...leadDeAnuncio },
      prepare: () => void resetFakeBelasis(ctx),
      turns: [
        {
          user: "Gostaria de agendar um horário!",
          expect: { text: { mustMatchAll: [/Judite/], mustNotMatch: [NOME_ANTIGO] } },
        },
        {
          user: "Qual valor corte",
          expect: {
            text: { mustMatchAll: [/450/], mustNotMatch: [...CORTE_POR_TAMANHO, CORTE_MASCULINO, /R\$\s?200/] },
            custom: semTransferencia,
          },
        },
        {
          // A outra fala real que recebeu "R$ 560 para cabelo curto…" (07/nov).
          user: "Me passa o valor por favor",
          expect: { text: { mustMatchAll: [/450/], mustNotMatch: [...CORTE_POR_TAMANHO, CORTE_MASCULINO] } },
        },
      ],
    }),
  },

  {
    item: "5",
    name: "estacionamento",
    description: 'Mensagem de 12/nov ("Tem estacionamento próximo ao salão ?"): responde que há manobrista com valet',
    build: (ctx) => ({
      name: "estacionamento",
      description: "Estacionamento: manobrista com valet",
      context: { customerName: "Mariza", isNewCustomer: false },
      prepare: () => void resetFakeBelasis(ctx),
      turns: [
        {
          user: "Tem estacionamento próximo ao salão ?",
          expect: {
            text: { mustMatchAny: [/valet/i, /manobrista/i], mustNotMatch: [TRANSFERENCIA] },
            custom: semTransferencia,
          },
        },
      ],
    }),
  },

  {
    item: "6",
    name: "transporte",
    description: 'Mensagens de 08 e 12/nov ("Fica próximo metrô?", "Qual a estação de metrô mais perto?"): metrô e ônibus, sem transferir e sem inventar estação',
    build: (ctx) => {
      /** Estações que ela não tem como saber: se citar, inventou. */
      const ESTACAO_INVENTADA = /Ana Rosa|Para[ií]so|Vergueiro|S[aã]o Joaquim|Santa Cruz|Liberdade|Ch[aá]cara Klabin/i
      return {
        name: "transporte",
        description: "Transporte: dois metrôs próximos (região da Vila Mariana) e ônibus na frente",
        context: { customerName: "Cliente", isNewCustomer: true },
        prepare: () => void resetFakeBelasis(ctx),
        turns: [
          {
            user: "Fica próximo metrô?",
            expect: {
              text: { mustMatchAll: [/metr[oô]/i], mustMatchAny: [/Vila Mariana/i, /duas esta[cç][oõ]es/i, /dois metr[oô]s/i], mustNotMatch: [TRANSFERENCIA] },
              custom: semTransferencia,
            },
          },
          {
            user: "Qual a estação de metrô mais perto?",
            expect: { text: { mustNotMatch: [TRANSFERENCIA, ESTACAO_INVENTADA] }, custom: semTransferencia },
          },
        ],
      }
    },
  },

  {
    item: "7",
    name: "acessibilidade",
    description: 'Mensagens de 08 e 10/nov ("Local é terreo?", "Acesso fácil para pessoa com mobilidade??"): térreo, com rampa',
    build: (ctx) => ({
      name: "acessibilidade",
      description: "Acessibilidade: atendimento no térreo, com rampa de acesso",
      context: { customerName: "Cliente", isNewCustomer: true },
      prepare: () => void resetFakeBelasis(ctx),
      turns: [
        {
          user: "A partir de que horário o seu atendimento?\nLocal é terreo?",
          expect: { text: { mustMatchAll: [/t[eé]rreo/i], mustNotMatch: [TRANSFERENCIA] }, custom: semTransferencia },
        },
        {
          user: "Acesso fácil para pessoa com mobilidade??",
          expect: { text: { mustMatchAny: [/rampa/i, /t[eé]rreo/i], mustNotMatch: [TRANSFERENCIA] }, custom: semTransferencia },
        },
      ],
    }),
  },

  {
    item: "8 e 9",
    name: "precos_em_geral",
    description:
      'Mensagem de 04/nov ("Quais são os preços dos serviços de cabelo?"): não despeja a tabela; fala do corte e pergunta o que mais ela quer saber',
    build: (ctx) => ({
      name: "precos_em_geral",
      description: "Preços em geral: sem listar a tabela inteira e sem o corte masculino",
      context: { customerName: "Cliente", ...leadDeAnuncio },
      prepare: () => void resetFakeBelasis(ctx),
      turns: [
        {
          user: "Quais são os preços dos serviços de cabelo?",
          expect: {
            text: {
              mustMatchAll: [/450/, /\?/],
              // Antes: nove valores numa mensagem só, com lavagem (R$ 30) e
              // finalização (R$ 80/140) parecendo cobrança extra do corte.
              mustNotMatch: [...CORTE_POR_TAMANHO, CORTE_MASCULINO, /R\$\s?30\b/, /R\$\s?80\b/, /R\$\s?140\b/, /R\$\s?200\b/],
            },
            custom: (result) =>
              countPrices(result.text) > 2 ? `listou ${countPrices(result.text)} valores de uma vez (a tabela inteira)` : null,
          },
        },
        {
          // Pergunta de continuação (não é de uma conversa real): o alinhamento é
          // serviço avulso, "a partir de", e não entra em pacote.
          user: "E o alinhamento?",
          expect: {
            text: { mustMatchAll: [/600/, /a partir de/i], mustNotMatch: [/faz parte d[eo] pacote/i, /incluso no corte/i] },
          },
        },
      ],
    }),
  },

  {
    item: "10",
    name: "corte_e_hidratacao",
    description:
      'Mensagem de 09/nov ("Corte e hidratação"): dois serviços, o preço de cada um, um agendamento para cada no mesmo cadastro, sem passar para o Fabiano',
    build: (ctx) => {
      let fake: FakeBelasis
      return {
        name: "corte_e_hidratacao",
        description: "Mais de um serviço: preços separados e um agendamento por serviço",
        context: { customerName: "Cliente", ...leadDeAnuncio },
        prepare: () => {
          fake = resetFakeBelasis(ctx)
        },
        turns: [
          { user: "Quero agendar um horário!", expect: {} },
          {
            user: "Corte e hidratação",
            expect: {
              text: { mustMatchAll: [/450/, new RegExp(String(HIDRATACAO_TEST_PRICE))], mustNotMatch: [TRANSFERENCIA] },
              custom: semTransferencia,
            },
          },
          // Daqui em diante a conversa real parou (foi passada ao Fabiano). As
          // falas abaixo só levam o agendamento até o fim, para conferir que saem
          // DOIS agendamentos no mesmo cadastro.
          { user: "Sábado às 10h", expect: { custom: semTransferencia } },
          { user: "Maria Aparecida de Souza", expect: { custom: semTransferencia } },
          { user: "Isso, pode marcar os dois", expect: { custom: semTransferencia } },
        ],
        verify: async (run) => {
          const failures: string[] = []
          const booked = await loadActiveAppointments(run.salonId, run.customerId)
          const serviceIds = booked.map((a) => a.serviceId)
          if (!serviceIds.includes(ctx.corteFemininoId)) failures.push("o corte não foi agendado")
          if (!serviceIds.includes(ctx.hidratacaoId)) failures.push("a hidratação não foi agendada")
          if (booked.length !== 2) failures.push(`esperava 2 agendamentos (um por serviço), achei ${booked.length}`)
          if (booked.length === 2 && booked[0]!.endTime.getTime() > booked[1]!.date.getTime()) {
            failures.push("os dois agendamentos se sobrepõem")
          }

          if (fake.state.clients.length !== 1) failures.push(`os dois serviços deviam ir para o MESMO cadastro; há ${fake.state.clients.length}`)
          if (fake.state.groups.length !== 2) failures.push(`esperava 2 agendamentos na agenda do salão, achei ${fake.state.groups.length}`)
          if (new Set(fake.state.groups.map((g) => g.client_id)).size > 1) failures.push("os agendamentos foram para cadastros diferentes")
          return failures
        },
      }
    },
  },

  {
    item: "11",
    name: "pedido_de_desconto",
    description:
      'Conversa de 07/nov ("Mas ele não pode abaixar o preço p mim", "Sou classe baixa"): resposta curta e acolhedora, o Fabiano fala com ela; sem desculpas e sem "não vou prometer"',
    build: (ctx) => {
      const PROIBIDO = [/desculp/i, /n[ãa]o (vou|posso|consigo) (prometer|garantir)/i, /promet/i, /insens[ií]vel/i]
      return {
        name: "pedido_de_desconto",
        description: "Desconto: não concede; avisa que o Fabiano fala com ela, sem se desculpar",
        context: { customerName: "Gi", ...leadDeAnuncio },
        prepare: () => void resetFakeBelasis(ctx),
        turns: [
          { user: "Gostaria de agendar um horário!", expect: {} },
          { user: "Qual valor corte", expect: { text: { mustMatchAll: [/450/] } } },
          {
            user: "Mas ele não pode abaixar o preço p mim",
            expect: {
              text: { maxSentences: 2, mustMatchAll: [/Fabiano/], mustNotMatch: PROIBIDO },
              tools: { forbidden: ["addAppointment"] },
            },
          },
          { user: "Sou classe baixa", expect: { text: { maxSentences: 2, mustNotMatch: PROIBIDO } } },
        ],
      }
    },
  },

  {
    item: "12",
    name: "despedida_com_instagram",
    description: 'Fim de conversa real de 10/nov ("Muito obrigada!", "Boa semana"): convida para o Instagram @fabianoeber, uma vez só',
    build: (ctx) => ({
      name: "despedida_com_instagram",
      description: "Despedida: convite para seguir @fabianoeber, uma única vez",
      context: { customerName: "Marcia", isNewCustomer: false },
      prepare: () => void resetFakeBelasis(ctx),
      turns: [
        { user: "Tem estacionamento próximo ao salão ?", expect: { text: { mustNotMatch: [/@fabianoeber/i] } } },
        { user: "Muito obrigada!", expect: { text: { mustMatchAll: [/@fabianoeber/i, /Instagram/i] } } },
        { user: "Boa semana", expect: { text: { mustNotMatch: [/@fabianoeber/i] } } },
      ],
    }),
  },
]
