"use server"

import { z } from "zod"
import {
  brazilToday,
  getAppointmentReportService,
  listBirthdaysService,
  listInactiveCustomersService,
  parseAppointmentReportView,
  parseCustomerReportView,
  planBirthdayMonth,
  planInactiveDays,
  planReportPeriod,
  type AppointmentReport,
  type BirthdayRow,
  type InactiveRow,
  type PermissionKey,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"

/**
 * Relatórios de agendamentos e de clientes (docs/ROADMAP.md, fase 9, fatia 9c).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `reports` ligado no
 * salão → permissão. O `salonId` chega do cliente, então estar logado não basta
 * (ver __tests__/lib/actions-authz.test.ts).
 *
 * Agendamentos mostram a agenda de TODOS os profissionais: pedem
 * `schedule.view_all`. Clientes pedem `customers.access`; o telefone só aparece
 * para quem tem `customers.view_phones`.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reports"))) {
    return { error: "Relatórios não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

const appointmentFiltersSchema = z.object({
  view: z.string().max(20).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
})

export type AppointmentReportData = { from: string; to: string } & AppointmentReport

/** O relatório de agendamentos pedido em `view` (sem `view`, todos os agendamentos). */
export async function getAppointmentReport(
  salonId: string,
  filters: z.infer<typeof appointmentFiltersSchema> = {}
): Promise<AppointmentReportData | { error: string }> {
  const auth = await authorizeSalon(salonId, "schedule.view_all")
  if ("error" in auth) return auth

  const parsed = appointmentFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const period = planReportPeriod({ from: parsed.data.from, to: parsed.data.to }, new Date())
  if (!period.ok) return { error: period.error }

  try {
    const report = await getAppointmentReportService({
      salonId,
      view: parseAppointmentReportView(parsed.data.view),
      from: period.from,
      to: period.to,
    })
    return { from: period.from, to: period.to, ...report }
  } catch (error) {
    console.error("Erro ao carregar o relatório de agendamentos:", error)
    return { error: "Não foi possível carregar o relatório" }
  }
}

const customerFiltersSchema = z.object({
  view: z.string().max(20).optional(),
  month: z.string().max(2).optional(),
  days: z.string().max(4).optional(),
})

export type CustomerReportData = { showPhones: boolean; truncated: boolean } & (
  | { view: "birthdays"; month: number; year: number; rows: BirthdayRow[] }
  | { view: "inactive"; days: number; today: string; rows: InactiveRow[] }
)

/** O relatório de clientes pedido em `view` (sem `view`, os aniversariantes do mês). */
export async function getCustomerReport(
  salonId: string,
  filters: z.infer<typeof customerFiltersSchema> = {}
): Promise<CustomerReportData | { error: string }> {
  const auth = await authorizeSalon(salonId, "customers.access")
  if ("error" in auth) return auth

  const parsed = customerFiltersSchema.safeParse(filters)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const now = new Date()
  const today = brazilToday(now)
  const view = parseCustomerReportView(parsed.data.view)

  try {
    const showPhones = await can(salonId, auth.userId, "customers.view_phones")

    if (view === "inactive") {
      const days = planInactiveDays(parsed.data.days)
      const list = await listInactiveCustomersService({ salonId, today, days, showPhones })
      return { view, days, today, showPhones, ...list }
    }

    const month = planBirthdayMonth(parsed.data.month, now)
    const year = Number(today.slice(0, 4))
    const list = await listBirthdaysService({ salonId, month, year, showPhones })
    return { view, month, year, showPhones, ...list }
  } catch (error) {
    console.error("Erro ao carregar o relatório de clientes:", error)
    return { error: "Não foi possível carregar o relatório" }
  }
}
