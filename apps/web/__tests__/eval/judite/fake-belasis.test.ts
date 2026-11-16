/**
 * A Belasis de mentira dos cenários da Judite precisa se comportar como a de
 * verdade nos pontos que o código usa — senão o cenário passa por causa do
 * simulador, e não por causa do código. Aqui ela é exercitada pelo PROVEDOR REAL
 * (BelasisAgendaProvider + BelasisClient), sem banco e sem modelo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { BelasisClient } from "@repo/db/src/infrastructure/integrations/belasis/belasis-client"
import {
  BelasisAgendaProvider,
  clearBelasisFreeTimesCache,
  clearBelasisLookupCaches,
} from "@repo/db/src/infrastructure/integrations/belasis/belasis-agenda-provider"
import { createFakeBelasis, type FakeBelasisOptions } from "./fake-belasis"

const PHONE = "5511988888551"

function setup(options: FakeBelasisOptions = {}, trafficColor: string | null = "Marrom") {
  const fake = createFakeBelasis(options)
  const realFetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => "rede de verdade" }) as unknown as Response)
  const client = new BelasisClient({
    apiKey: "bpk_simulada",
    fetchImpl: fake.wrapFetch(realFetch as unknown as typeof fetch),
    rateLimiter: { acquire: async () => undefined },
    sleep: async () => undefined,
  })
  return { fake, realFetch, provider: new BelasisAgendaProvider(client, { trafficColor }) }
}

/** 17/11/2026 às 17h → 18h, em Brasília. */
const slot = (day: string, hour: number) => ({
  start: new Date(`2026-11-${day}T${String(hour + 3).padStart(2, "0")}:00:00.000Z`),
  end: new Date(`2026-11-${day}T${String(hour + 4).padStart(2, "0")}:00:00.000Z`),
})

const booking = (day: string, hour: number, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: "00000000-0000-4000-8000-0000000000d1",
  externalProfessionalId: "7",
  externalServiceId: "33",
  ...slot(day, hour),
  customer: { name: "Fernanda Lima Duarte", phone: PHONE },
  ...extra,
})

/** A cliente já cadastrada pela recepção, com o corte de 17/11 às 17h marcado lá. */
const receptionState: FakeBelasisOptions = {
  clients: [{ id: 88, name: "Fernanda Lima Duarte", cellphone: "11988888551", active: true }],
  groups: [
    {
      id: 610,
      client_id: 88,
      status: "unconfirmed",
      date: "2026-11-17",
      calendars: [{ id: 9100, inventory_product_id: 33, employee_id: 7, start_hour: "17:00", end_hour: "18:00" }],
    },
  ],
}

beforeEach(() => {
  clearBelasisFreeTimesCache()
  clearBelasisLookupCaches()
})

describe("Belasis simulada × provedor real", () => {
  it("cliente nova: cadastra com o nome informado e agenda com a cor de tráfego", async () => {
    const { fake, provider } = setup()

    expect(await provider.findCustomerByPhone(PHONE)).toBeNull()
    const created = await provider.createAppointment(
      booking("21", 11, { customer: { name: "Silvana Prado Lima", phone: PHONE }, leadSource: "paid_traffic" })
    )

    expect(fake.state.clients).toEqual([
      expect.objectContaining({ name: "Silvana Prado Lima", cellphone: PHONE }),
    ])
    const group = fake.state.groups.find((g) => String(g.id) === created.externalId)
    expect(group).toMatchObject({ date: "2026-11-21", schedule_color_id: 17 })
    expect(group?.calendars[0]).toMatchObject({ start_hour: "11:00", end_hour: "12:00", employee_id: 7 })
  })

  it("cliente da recepção: acha o cadastro pelo telefone (guardado sem DDI) e enxerga o horário dela", async () => {
    const { provider } = setup(receptionState)

    const found = await provider.findCustomerByPhone(PHONE)
    expect(found).toEqual({ externalId: "88", name: "Fernanda Lima Duarte" })

    const hers = await provider.listCustomerAppointments("88", {
      start: new Date("2026-11-12T03:00:00.000Z"),
      end: new Date("2027-05-11T03:00:00.000Z"),
    })
    expect(hers).toHaveLength(1)
    expect(hers[0]).toMatchObject({ externalId: "610", status: "active", externalCustomerId: "88" })
  })

  it("remarcar para outro dia: nasce o novo no MESMO cadastro e o antigo sai", async () => {
    const { fake, provider } = setup(receptionState)

    const moved = await provider.rescheduleAppointment("610", booking("19", 17, { customer: { name: "x", phone: PHONE, externalId: "88" } }))

    expect(moved.externalId).not.toBe("610")
    expect(fake.state.clients).toHaveLength(1)
    expect(fake.activeGroupsOf(88).map((g) => g.date)).toEqual(["2026-11-19"])
    expect(fake.writes().map((r) => r.method)).toEqual(["POST", "DELETE"])
  })

  it("remarcar no mesmo dia: só muda a hora do agendamento que já existe", async () => {
    const { fake, provider } = setup(receptionState)

    const moved = await provider.rescheduleAppointment("610", booking("17", 15, { customer: { name: "x", phone: PHONE, externalId: "88" } }))

    expect(moved.externalId).toBe("610")
    expect(fake.state.groups).toHaveLength(1)
    expect(fake.state.groups[0]?.calendars[0]).toMatchObject({ start_hour: "15:00", end_hour: "16:00" })
  })

  it("a grade mostra ocupado o horário marcado — e o cancelado continua ocupando", async () => {
    const { fake, provider } = setup(receptionState)
    const window = { externalProfessionalId: "7", ...slot("17", 17), fresh: true }

    expect(await provider.getBusyIntervals(window)).not.toEqual([])

    fake.state.groups[0]!.status = "disconfirm"
    expect(await provider.getBusyIntervals(window)).not.toEqual([])

    fake.state.groups.length = 0
    expect(await provider.getBusyIntervals(window)).toEqual([])
  })

  it("cor que a conta não tem: a simulada recusa (422) e o provedor agenda sem cor", async () => {
    const { fake, provider } = setup(receptionState, "999")

    const created = await provider.createAppointment(
      booking("20", 10, { customer: { name: "x", phone: PHONE, externalId: "88" }, leadSource: "paid_traffic" })
    )

    const posts = fake.writes().filter((r) => r.method === "POST")
    expect(posts.map((r) => r.body?.schedule_color_id)).toEqual([999, undefined])
    expect(fake.state.groups.find((g) => String(g.id) === created.externalId)?.schedule_color_id).toBeNull()
  })

  it("celular repetido é recusado, como na Belasis", async () => {
    const { fake } = setup({ clients: [{ id: 1, name: "Maria", cellphone: PHONE }] })
    const reply = await fake.wrapFetch(fetch)(`https://api.belasis.com.br/api/v1/clients`, {
      method: "POST",
      body: JSON.stringify({ name: "Maria Outra", phone: PHONE, cellphone: PHONE }),
    })

    expect(reply.status).toBe(422)
    expect(JSON.parse(await reply.text())).toEqual(["Celular já está em uso"])
  })

  it("o que não é Belasis vai para a rede de verdade (o modelo continua sendo chamado)", async () => {
    const { fake, realFetch } = setup()
    const wrapped = fake.wrapFetch(realFetch as unknown as typeof fetch)

    const reply = await wrapped("https://api.openai.com/v1/responses", { method: "POST", body: "{}" })

    expect(await reply.text()).toBe("rede de verdade")
    expect(realFetch).toHaveBeenCalledTimes(1)
    expect(fake.state.requests).toEqual([])
  })
})
