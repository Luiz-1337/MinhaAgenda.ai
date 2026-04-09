"use client"

import { useEffect } from "react"
import { MessageCircle, X } from "lucide-react"

interface QRCodeModalProps {
  open: boolean
  onClose: () => void
  qrcode: string // Base64 QR code
  message?: string
  instructions?: string[]
  onStatusCheck?: () => Promise<{ connected?: boolean } | null>
  pollIntervalMs?: number
}

/**
 * Modal para exibir QR code de conexão WhatsApp (Evolution API)
 */
export function QRCodeModal({
  open,
  onClose,
  qrcode,
  message = "Escaneie o QR code com seu WhatsApp para conectar",
  onStatusCheck,
  pollIntervalMs = 3000,
  instructions = [
    "1. Abra o WhatsApp no seu celular",
    "2. Toque em Mais opções (⋮) > Aparelhos conectados",
    "3. Toque em Conectar um aparelho",
    "4. Aponte seu celular para esta tela para escanear o código QR",
  ],
}: QRCodeModalProps) {
  // Poll para detectar quando o usuário escaneou e conectou
  useEffect(() => {
    if (!open || !onStatusCheck || !pollIntervalMs) return
    const interval = setInterval(async () => {
      const result = await onStatusCheck()
      if (result?.connected) {
        onClose()
      }
    }, pollIntervalMs)
    return () => clearInterval(interval)
  }, [open, onStatusCheck, pollIntervalMs, onClose])

  if (!open) return null

  // Normaliza o src da imagem: aceita base64 puro ou data URL completo (remove espaços/quebras que quebram o data URL)
  const raw = typeof qrcode === "string" ? qrcode.replace(/\s/g, "").trim() : ""
  const qrcodeSrc =
    !raw
      ? ""
      : raw.startsWith("data:")
        ? raw
        : `data:image/png;base64,${raw}`

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 z-30 animate-in fade-in duration-300"
        aria-hidden
      />

      <div
        className="relative w-full max-w-md bg-card border border-border rounded-lg z-40 overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qrcode-modal-title"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <MessageCircle size={24} />
              </div>
              <h3 id="qrcode-modal-title" className="text-lg font-bold text-foreground">
                Conectar WhatsApp
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {message}
          </p>

          <div className="flex justify-center items-center p-4 bg-background rounded-md border border-border mb-4 min-h-[17rem]">
            {qrcodeSrc ? (
              <img
                src={qrcodeSrc}
                alt="QR Code para conectar WhatsApp"
                className="w-64 h-64 object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                Carregando QR code...
              </p>
            )}
          </div>

          <ol className="space-y-1.5 text-sm text-muted-foreground mb-6">
            {instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
