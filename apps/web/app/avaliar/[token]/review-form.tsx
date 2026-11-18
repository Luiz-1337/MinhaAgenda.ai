"use client"

import { useState, useTransition } from "react"
import { Star } from "lucide-react"
import { submitPublicReview } from "@/app/actions/public-reviews"

const RATING_LABELS = ["Muito ruim", "Ruim", "Regular", "Bom", "Excelente"] as const

function Stars({ value, onChange, disabled }: { value: number; onChange?: (rating: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} de 5: ${RATING_LABELS[rating - 1]}`}
          disabled={disabled || !onChange}
          onClick={() => onChange?.(rating)}
          className="p-1 rounded-md transition-transform enabled:hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <Star
            size={36}
            className={rating <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
          />
        </button>
      ))}
    </div>
  )
}

/**
 * O formulário de avaliação: nota de 1 a 5 e comentário opcional. Responde-se uma
 * vez só — depois disso (ou se já foi respondido) mostra o agradecimento.
 */
export function ReviewForm({
  token,
  welcome,
  thanks,
  alreadyRated,
}: {
  token: string
  welcome: string
  thanks: string
  /** A nota já dada, se o pedido já foi respondido. */
  alreadyRated: number | null
}) {
  const [isPending, startTransition] = useTransition()
  const [rating, setRating] = useState(alreadyRated ?? 0)
  const [comment, setComment] = useState("")
  const [done, setDone] = useState(alreadyRated !== null)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (rating < 1) {
      setError("Escolha uma nota de 1 a 5")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitPublicReview({ token, rating, comment: comment.trim() || null })
      if ("error" in result) {
        setError(result.error)
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="space-y-3 text-center" role="status">
        <Stars value={rating} disabled />
        <p className="text-sm font-semibold text-foreground">{thanks}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">{welcome}</p>

      <div className="space-y-1">
        <Stars value={rating} onChange={setRating} disabled={isPending} />
        <p className="text-center text-xs text-muted-foreground h-4">{rating > 0 ? RATING_LABELS[rating - 1] : ""}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="review-comment" className="text-xs font-semibold text-muted-foreground">
          Comentário (opcional)
        </label>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={1000}
          value={comment}
          disabled={isPending}
          onChange={(event) => setComment(event.target.value)}
          className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all resize-none disabled:opacity-60"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive text-center">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending ? "Enviando…" : "Enviar avaliação"}
      </button>
    </div>
  )
}
