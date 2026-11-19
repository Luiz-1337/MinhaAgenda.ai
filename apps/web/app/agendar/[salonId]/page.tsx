import type { Metadata } from "next"
import { getOnlineBookingSalonService } from "@repo/db"
import { BookingForm } from "./booking-form"

/**
 * Página pública de agendamento do salão (docs/ROADMAP.md, fase 7, fatia 7f).
 *
 * Página SEM login: o cliente escolhe serviço, profissional, dia e horário e
 * informa nome e WhatsApp. Só existe para salão com o módulo `online_booking`
 * ligado; para os outros (e para id desconhecido) a resposta é a mesma.
 */

export const metadata: Metadata = {
  title: "Agendamento online",
  robots: { index: false, follow: false },
}

// Os horários mudam a cada agendamento: nunca em cache.
export const dynamic = "force-dynamic"

export default async function PublicBookingPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const salon = await getOnlineBookingSalonService(salonId, new Date())

  return (
    <main className="min-h-screen bg-background flex items-start justify-center p-4 sm:py-10">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl p-6 space-y-5">
        {!salon ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-bold text-foreground">Agendamento online indisponível</h1>
            <p className="text-sm text-muted-foreground">
              Este endereço não existe ou o salão não está recebendo agendamentos por aqui. Fale direto com o salão.
            </p>
          </div>
        ) : (
          <>
            <header className="space-y-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agendamento online</p>
              <h1 className="text-xl font-bold text-foreground">{salon.salonName}</h1>
            </header>

            {salon.services.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">
                Ainda não há serviços para marcar por aqui. Fale direto com o salão.
              </p>
            ) : (
              <BookingForm
                salonId={salonId}
                services={salon.services}
                firstDay={salon.firstDay}
                lastDay={salon.lastDay}
                deposit={salon.deposit}
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}
