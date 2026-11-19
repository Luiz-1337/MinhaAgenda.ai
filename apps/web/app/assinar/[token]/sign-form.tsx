"use client"

import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react"
import { useRouter } from "next/navigation"
import { signPublicDocument } from "@/app/actions/public-documents"

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 200

function paintBlank(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d")
  if (!context) return
  // Fundo branco de verdade (e não transparente): a assinatura é vista em tela
  // clara e escura.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = "#111111"
  context.lineWidth = 2.5
  context.lineCap = "round"
  context.lineJoin = "round"
}

/**
 * O formulário de assinatura: nome completo, a assinatura desenhada (dedo, caneta
 * ou mouse) e o "li e concordo". Assina-se uma vez só — depois a página recarrega
 * e mostra o documento assinado.
 */
export function SignForm({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const [signerName, setSignerName] = useState("")
  const [accepted, setAccepted] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (canvasRef.current) paintBlank(canvasRef.current)
  }, [])

  function point(event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isPending) return
    const context = event.currentTarget.getContext("2d")
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const { x, y } = point(event)
    context.beginPath()
    context.moveTo(x, y)
    // Um toque sem arrastar também deixa marca.
    context.lineTo(x + 0.1, y + 0.1)
    context.stroke()
    setHasInk(true)
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const context = event.currentTarget.getContext("2d")
    if (!context) return
    const { x, y } = point(event)
    context.lineTo(x, y)
    context.stroke()
  }

  function stop() {
    drawing.current = false
  }

  function clear() {
    if (canvasRef.current) paintBlank(canvasRef.current)
    setHasInk(false)
  }

  function submit() {
    if (signerName.trim().length < 3) {
      setError("Escreva o seu nome completo")
      return
    }
    if (!hasInk || !canvasRef.current) {
      setError("Desenhe a sua assinatura")
      return
    }
    if (!accepted) {
      setError("Marque que você leu e concorda com o documento")
      return
    }
    setError(null)
    const signatureImage = canvasRef.current.toDataURL("image/png")
    startTransition(async () => {
      const result = await signPublicDocument({ token, signerName, signatureImage, accepted })
      if ("error" in result) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="signer-name" className="text-xs font-semibold text-muted-foreground">
          Seu nome completo
        </label>
        <input
          id="signer-name"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={signerName}
          disabled={isPending}
          onChange={(event) => setSignerName(event.target.value)}
          className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span id="signature-label" className="text-xs font-semibold text-muted-foreground">
            Sua assinatura (desenhe com o dedo ou o mouse)
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={isPending || !hasInk}
            className="text-xs font-semibold text-accent hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Limpar
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          role="img"
          aria-labelledby="signature-label"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          className="w-full aspect-[3/1] bg-white border border-border rounded-md touch-none cursor-crosshair"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={accepted}
          disabled={isPending}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5"
        />
        Li o documento acima e concordo com ele.
      </label>

      <p className="text-xs text-muted-foreground">
        Ao assinar, ficam registrados o seu nome, a assinatura, a data e a hora, e o endereço de internet e o navegador
        usados.
      </p>

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
        {isPending ? "Enviando…" : "Assinar documento"}
      </button>
    </div>
  )
}
