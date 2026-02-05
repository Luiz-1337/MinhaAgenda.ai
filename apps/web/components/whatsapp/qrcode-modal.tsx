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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop sem fechar ao clicar fora */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
        aria-hidden
      />

      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qrcode-modal-title"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <MessageCircle size={24} />
              </div>
              <h3 id="qrcode-modal-title" className="text-lg font-bold text-slate-800 dark:text-white">
                Conectar WhatsApp
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {message}
          </p>

          <div className="flex justify-center items-center p-4 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-white/10 mb-4 min-h-[17rem]">
            {qrcodeSrc ? (
              <img
                src={qrcodeSrc}
                alt="QR Code para conectar WhatsApp"
                className="w-64 h-64 object-contain"
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                Carregando QR code...
              </p>
            )}
          </div>

          <ol className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400 mb-6">
            {instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
