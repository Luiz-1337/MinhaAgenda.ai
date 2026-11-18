import type { Metadata } from "next"
import { getPublicReviewService } from "@repo/db"
import { ReviewForm } from "./review-form"

/**
 * Formulário público de avaliação (docs/ROADMAP.md, fase 6, fatia 6c).
 *
 * Página SEM login: quem abre é o cliente do salão, pelo link que recebeu. A única
 * credencial é o token da URL. Mostra só o nome do salão e o dia do atendimento.
 */

export const metadata: Metadata = {
  title: "Avaliação do atendimento",
  // O link é pessoal: não é para buscador.
  robots: { index: false, follow: false },
}

// Cada pedido é de uma pessoa e muda quando ela responde: nunca em cache.
export const dynamic = "force-dynamic"

function formatDay(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

export default async function PublicReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const review = await getPublicReviewService(token)

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-5">
        {!review ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-bold text-foreground">Link de avaliação inválido</h1>
            <p className="text-sm text-muted-foreground">
              Este link não existe ou não vale mais. Se quiser avaliar o seu atendimento, peça um novo link ao salão.
            </p>
          </div>
        ) : (
          <>
            <header className="space-y-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {review.salonName}
              </p>
              <h1 className="text-xl font-bold text-foreground">{review.texts.title}</h1>
            </header>

            <ReviewForm
              token={token}
              welcome={review.texts.welcome}
              thanks={review.texts.thanks}
              alreadyRated={review.rating}
            />

            <footer className="pt-3 border-t border-border text-center text-xs text-muted-foreground">
              Atendimento de {formatDay(review.serviceDate)}
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
