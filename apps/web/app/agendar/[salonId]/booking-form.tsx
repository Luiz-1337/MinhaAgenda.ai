"use client"

import { useEffect, useState, useTransition } from "react"
import { createPublicBooking, getPublicBookingSlots } from "@/app/actions/public-booking"
import type { AdvancePaymentConfig, OnlineBookingService } from "@repo/db"

const fieldClass =
  "w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60"
const labelClass = "text-xs font-semibold text-muted-foreground"

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function formatDay(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`
}

type SlotsState = { key: string; slots: string[]; error: string | null }

/**
 * O formulário de agendamento: serviço → profissional → dia → horário → nome e
 * WhatsApp. Os horários vêm do servidor a cada escolha, e o servidor confere de
 * novo na hora de marcar.
 */
export function BookingForm({
  salonId,
  services,
  firstDay,
  lastDay,
  deposit,
}: {
  salonId: string
  services: OnlineBookingService[]
  firstDay: string
  lastDay: string
  /** O sinal que o salão pede. O cliente paga por PIX direto ao salão. */
  deposit: AdvancePaymentConfig | null
}) {
  const [isPending, startTransition] = useTransition()

  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "")
  const [professionalId, setProfessionalId] = useState("")
  const [day, setDay] = useState("")
  const [time, setTime] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [website, setWebsite] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ day: string; time: string; deposit: AdvancePaymentConfig | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [loaded, setLoaded] = useState<SlotsState | null>(null)
  const [reload, setReload] = useState(0)

  const service = services.find((item) => item.id === serviceId) ?? null
  // Com um profissional só, não há o que escolher.
  const chosenProfessionalId =
    service && service.professionals.length === 1 ? service.professionals[0].id : professionalId
  const professional = service?.professionals.find((item) => item.id === chosenProfessionalId) ?? null

  const slotsKey = service && professional && day ? `${service.id}|${professional.id}|${day}|${reload}` : null

  useEffect(() => {
    if (!slotsKey || !service || !professional) return
    let cancelled = false
    getPublicBookingSlots({ salonId, serviceId: service.id, professionalId: professional.id, day }).then((result) => {
      if (cancelled) return
      setLoaded(
        "error" in result
          ? { key: slotsKey, slots: [], error: result.error }
          : { key: slotsKey, slots: result.slots, error: null }
      )
    })
    return () => {
      cancelled = true
    }
    // `slotsKey` já resume serviço, profissional, dia e a recarga pedida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsKey, salonId])

  const slots = loaded && loaded.key === slotsKey ? loaded : null
  const chosenTime = slots?.slots.includes(time) ? time : ""

  function submit() {
    if (!service || !professional || !day || !chosenTime) {
      setError("Escolha o serviço, o dia e o horário")
      return
    }
    if (name.trim().length < 2) {
      setError("Escreva o seu nome")
      return
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Informe o seu WhatsApp com DDD. Ex.: (11) 91234-5678")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createPublicBooking({
        salonId,
        serviceId: service.id,
        professionalId: professional.id,
        day,
        time: chosenTime,
        name,
        phone,
        website,
      })
      if ("error" in result) {
        setError(result.error)
        // O horário pode ter sido ocupado: busca a lista de novo. A escolha só cai
        // se o horário sumiu da lista (ver `chosenTime`) — erro de nome ou de
        // telefone não faz o cliente escolher tudo outra vez.
        setReload((value) => value + 1)
        return
      }
      setDone({ day: result.day, time: result.time, deposit: result.deposit })
    })
  }

  if (done && service && professional) {
    return (
      <div className="space-y-3 text-center" role="status">
        <h2 className="text-lg font-bold text-foreground">Horário marcado</h2>
        <p className="text-sm text-foreground">
          {service.name} com {professional.name}
          <br />
          {formatDay(done.day)} às {done.time}
        </p>
        {done.deposit && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-left">
            <p className="text-sm font-semibold text-foreground">
              Falta o sinal de {money.format(done.deposit.amountCents / 100)} para garantir o horário
            </p>
            <p className="text-xs text-muted-foreground">
              Pague por PIX direto ao salão e envie o comprovante para o WhatsApp dele. O valor é abatido no dia do
              atendimento. O salão confirma o recebimento.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-card px-2 py-1.5 text-sm text-foreground">
                {done.deposit.pixKey}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(done.deposit?.pixKey ?? "").then(
                    () => setCopied(true),
                    () => setCopied(false)
                  )
                }}
                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                {copied ? "Copiada" : "Copiar chave"}
              </button>
            </div>
            {done.deposit.pixName && (
              <p className="text-xs text-muted-foreground">Chave PIX em nome de {done.deposit.pixName}.</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Se precisar remarcar ou cancelar, fale com o salão. Você pode fechar esta página.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="booking-service" className={labelClass}>
          Serviço
        </label>
        <select
          id="booking-service"
          value={serviceId}
          disabled={isPending}
          onChange={(event) => {
            setServiceId(event.target.value)
            setProfessionalId("")
            setTime("")
          }}
          className={fieldClass}
        >
          {services.length > 1 && <option value="">Escolha um serviço…</option>}
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {formatDuration(item.duration)}
              {item.priceLabel ? ` · ${item.priceLabel}` : ""}
            </option>
          ))}
        </select>
        {service?.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
      </div>

      {service && service.professionals.length > 1 && (
        <div className="space-y-1">
          <label htmlFor="booking-professional" className={labelClass}>
            Profissional
          </label>
          <select
            id="booking-professional"
            value={professionalId}
            disabled={isPending}
            onChange={(event) => {
              setProfessionalId(event.target.value)
              setTime("")
            }}
            className={fieldClass}
          >
            <option value="">Escolha um profissional…</option>
            {service.professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {service && professional && (
        <div className="space-y-1">
          <label htmlFor="booking-day" className={labelClass}>
            Dia{service.professionals.length === 1 ? ` · com ${professional.name}` : ""}
          </label>
          <input
            id="booking-day"
            type="date"
            value={day}
            min={firstDay}
            max={lastDay}
            disabled={isPending}
            onChange={(event) => {
              setDay(event.target.value)
              setTime("")
            }}
            className={fieldClass}
          />
        </div>
      )}

      {slotsKey && (
        <div className="space-y-1">
          <p id="booking-slots-label" className={labelClass}>
            Horário
          </p>
          {!slots ? (
            <p className="text-sm text-muted-foreground">Carregando horários…</p>
          ) : slots.error ? (
            <p className="text-sm text-destructive">{slots.error}</p>
          ) : slots.slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem horário livre neste dia. Escolha outro dia.</p>
          ) : (
            <div role="radiogroup" aria-labelledby="booking-slots-label" className="flex flex-wrap gap-2">
              {slots.slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={chosenTime === slot}
                  disabled={isPending}
                  onClick={() => setTime(slot)}
                  className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors disabled:opacity-60 ${
                    chosenTime === slot
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {chosenTime && (
        <>
          <div className="space-y-1">
            <label htmlFor="booking-name" className={labelClass}>
              Seu nome
            </label>
            <input
              id="booking-name"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={name}
              disabled={isPending}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="booking-phone" className={labelClass}>
              Seu WhatsApp, com DDD
            </label>
            <input
              id="booking-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="(11) 91234-5678"
              value={phone}
              disabled={isPending}
              onChange={(event) => setPhone(event.target.value)}
              className={fieldClass}
            />
          </div>
          {/* Campo-isca para robôs: fora da tela e fora da ordem de tabulação. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Site
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            O salão usa o seu nome e o seu WhatsApp para registrar o horário e falar com você sobre ele.
          </p>
        </>
      )}

      {deposit && (
        <p role="note" className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Este salão pede um sinal de <strong className="text-foreground">{money.format(deposit.amountCents / 100)}</strong>{" "}
          por PIX para garantir o horário. A chave aparece depois que você marcar, e o valor é abatido no dia.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive text-center">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isPending || !chosenTime}
        className="w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending ? "Marcando…" : chosenTime ? `Marcar para ${formatDay(day)} às ${chosenTime}` : "Marcar horário"}
      </button>
    </div>
  )
}
