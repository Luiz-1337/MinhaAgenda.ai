/**
 * Resumo read-only do salão, fornecido ao juiz como verdade-base para detectar
 * invenção de preço/serviço/profissional. Montado UMA vez por run.
 */

import { db, salons, services, professionals, agents, and, eq } from "@repo/db"
import type { SalonSummary } from "../types"

function formatPrice(svc: {
  price: string | null
  priceType: string | null
  priceMin: string | null
  priceMax: string | null
}): string {
  if (svc.priceType === "range" && svc.priceMin && svc.priceMax) {
    return `R$${svc.priceMin}–${svc.priceMax}`
  }
  return svc.price ? `R$${svc.price}` : "—"
}

export async function buildSalonSummary(salonId: string): Promise<SalonSummary> {
  const [salon, agent, svcRows, proRows] = await Promise.all([
    db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { name: true } }),
    db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      columns: { name: true, tone: true },
    }),
    db.query.services.findMany({
      where: and(eq(services.salonId, salonId), eq(services.isActive, true)),
      columns: { name: true, price: true, priceType: true, priceMin: true, priceMax: true, duration: true },
    }),
    db.query.professionals.findMany({
      where: and(eq(professionals.salonId, salonId), eq(professionals.isActive, true)),
      columns: { id: true },
    }),
  ])

  return {
    salonName: salon?.name ?? "(salão)",
    agentName: agent?.name ?? "(agente)",
    tone: agent?.tone ?? "informal",
    professionalCount: proRows.length,
    services: svcRows.map((s) => ({
      name: s.name,
      price: formatPrice(s),
      durationMin: s.duration,
    })),
  }
}

export function renderSalonSummary(summary: SalonSummary): string {
  const lines = [
    `Salão: ${summary.salonName} · Agente: ${summary.agentName} (tom ${summary.tone}) · ${summary.professionalCount} profissionais ativos.`,
    `Serviços ativos (nome · preço · duração):`,
    ...summary.services.map((s) => `  - ${s.name} · ${s.price} · ${s.durationMin}min`),
  ]
  return lines.join("\n")
}
