"use client"

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from "react"
import { Loader2, Phone, CheckCircle, AlertCircle, RefreshCw } from "lucide-react"

interface VerificationModalProps {
  open: boolean
  onClose: () => void
  onVerify: (code: string) => Promise<void>
  onResend?: () => Promise<void>
  phoneNumber: string
  isLoading?: boolean
  error?: string | null
}

/**
 * Modal para verificação de código OTP do WhatsApp
 * Suporta entrada de 6 dígitos com auto-focus e colagem
 */
export function VerificationModal({
  open,
  onClose,
  onVerify,
  onResend,
  phoneNumber,
  isLoading = false,
  error = null,
}: VerificationModalProps) {
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""])
  const [localError, setLocalError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Foca no primeiro input quando abre
  useEffect(() => {
    if (open) {
      setCode(["", "", "", "", "", ""])
      setLocalError(null)
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [open])

  // Cooldown para reenvio
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  // Mascara o número de telefone
  const maskedPhone = phoneNumber
    ? phoneNumber.replace(/(\+\d{2})(\d{2})(\d+)(\d{4})/, "$1 $2 •••••-$4")
    : ""

  const handleChange = (index: number, value: string) => {
    // Aceita apenas dígitos
    const digit = value.replace(/\D/g, "").slice(-1)
    
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    setLocalError(null)

    // Move para o próximo input se preencheu
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Se completou todos os dígitos, submete automaticamente
    if (digit && index === 5) {
      const fullCode = newCode.join("")
      if (fullCode.length === 6) {
        handleSubmit(fullCode)
      }
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Backspace move para o input anterior se vazio
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    // Setas para navegação
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    
    if (pastedData.length > 0) {
      const newCode = [...code]
      for (let i = 0; i < pastedData.length && i < 6; i++) {
        newCode[i] = pastedData[i]
      }
      setCode(newCode)
      setLocalError(null)

      // Foca no último input preenchido ou no próximo vazio
      const focusIndex = Math.min(pastedData.length, 5)
      inputRefs.current[focusIndex]?.focus()

      // Se colou 6 dígitos, submete automaticamente
      if (pastedData.length === 6) {
        handleSubmit(pastedData)
      }
    }
  }

  const handleSubmit = async (submittedCode?: string) => {
    const fullCode = submittedCode || code.join("")
    
    if (fullCode.length !== 6) {
      setLocalError("Digite o código completo de 6 dígitos")
      return
    }

    try {
      await onVerify(fullCode)
    } catch {
      // Erro é tratado pelo componente pai
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || !onResend) return
    
    try {
      await onResend()
      setResendCooldown(60) // 60 segundos de cooldown
      setCode(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } catch {
      // Erro é tratado pelo componente pai
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone size={28} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            Verificação WhatsApp
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enviamos um código SMS para
          </p>
          <p className="text-sm font-medium text-slate-800 dark:text-white mt-1">
            {maskedPhone}
          </p>
        </div>

        {/* Code Input */}
        <div className="flex justify-center gap-2 mb-6">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={isLoading}
              className="w-12 h-14 text-center text-xl font-bold bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all disabled:opacity-50"
            />
          ))}
        </div>

        {/* Error */}
        {(error || localError) && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            <span>{error || localError}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isLoading || code.some((d) => !d)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Verificando...</span>
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                <span>Verificar</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>

            {onResend && (
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading || resendCooldown > 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={14} className={resendCooldown > 0 ? "" : ""} />
                {resendCooldown > 0 ? (
                  <span>Reenviar em {resendCooldown}s</span>
                ) : (
                  <span>Reenviar código</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Help text */}
        <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-4">
          O código expira em 10 minutos. Se não receber, verifique se o número está correto.
        </p>
      </div>
    </div>
  )
}
