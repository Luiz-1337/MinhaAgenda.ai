import type { AppointmentStatus } from "@/lib/utils/appointment-status"

/**
 * Tamanho de página da listagem de contatos.
 *
 * Mora aqui e NÃO em `app/actions/customers.ts` por um motivo concreto: arquivo
 * `"use server"` só pode exportar FUNÇÃO ASYNC. Não é só a regra do re-export de
 * tipo — um `export const` de valor derruba o build com
 * "Only async functions are allowed to be exported in a use server file".
 * O `tsc` não pega; só o `next build` pega.
 */
export const CUSTOMERS_PAGE_SIZE = 20

/**
 * Tipos da ficha do cliente.
 *
 * Vivem aqui e NÃO em `app/actions/customers.ts` porque aquele arquivo é
 * `"use server"`: no Next 16/Turbopack, re-exportar tipo de um módulo de Server
 * Action dá `ReferenceError` no SSR. Ver a nota em lib/types/appointments.ts.
 *
 * Todos os campos monetários são STRING — as colunas `numeric` chegam assim do
 * driver. Formate e converta com lib/utils/money.utils.
 */

/** Uma linha do histórico de agendamentos do cliente. */
export interface CustomerAppointmentRow {
  id: string
  date: string          // ISO
  endTime: string       // ISO
  status: AppointmentStatus
  serviceName: string
  professionalName: string
  priceCharged: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
}

/** Nota de atendimento, com autor resolvido. */
export interface CustomerNoteRow {
  id: string
  body: string
  authorName: string | null
  createdAt: string     // ISO
}

/**
 * Métricas derivadas do histórico.
 *
 * `null` significa "não há dado", nunca zero: um cliente sem atendimento
 * concluído não tem ticket médio R$ 0,00 — ele não tem ticket médio. A ficha
 * mostra "—" nesses casos, senão mentiria no primeiro dia de uso.
 */
export interface CustomerMetrics
{
  totalSpent: string | null
  averageTicket: string | null
  completedCount: number
  noShowCount: number
  cancelledCount: number
  firstVisitAt: string | null
  lastVisitAt: string | null
  /** Atendimentos concluídos nos últimos 90 / 365 dias. */
  visits90: number
  visits365: number
}

/** Perfil do Trinks, quando existe e foi encontrado lá. */
export interface CustomerTrinksSnapshot {
  totalSpent: string | null
  averageTicket: string | null
  visitCount90Days: number | null
  visitCount365Days: number | null
  lastVisitAt: string | null
  vipScore: number | null
  syncedAt: string | null
}

export interface CustomerDetail {
  id: string
  salonId: string
  name: string
  phone: string
  email: string | null
  /** jsonb livre: chaves da UI e as que a IA aprendeu. Exibido somente-leitura. */
  preferences: Record<string, unknown> | null
  /** Quando não é null, o cliente pediu para não receber mensagens. */
  optedOutAt: string | null
  optOutReason: string | null
  createdAt: string
  tags: { id: string; name: string; color: string }[]
  metrics: CustomerMetrics
  /** Passado e futuro na mesma lista, ordenados do mais recente para o mais antigo. */
  appointments: CustomerAppointmentRow[]
  notes: CustomerNoteRow[]
  trinks: CustomerTrinksSnapshot | null
  /** Risco de falta, do mesmo preditor que a IA usa. */
  noShowRisk: { isHighRisk: boolean; ratio: number; sampleSize: number }
  /**
   * Id do chat deste cliente, quando encontrado. `null` esconde o botão "Abrir
   * conversa" — o casamento chat↔contato ainda é por string de telefone, e há
   * contatos sem DDI que nunca batem. A Onda 2 (chats.customer_id) resolve.
   */
  chatId: string | null
}
