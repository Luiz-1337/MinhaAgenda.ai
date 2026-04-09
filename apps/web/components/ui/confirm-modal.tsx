"use client"

import { AlertTriangle, X } from "lucide-react"

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  type?: "danger" | "warning"
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirmar",
  type = "danger"
}: ConfirmModalProps) {
  if (!open) return null

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-30 bg-black/50 animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Small Modal Card */}
      <div className="relative z-40 w-full max-w-sm bg-card border border-border rounded-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-md ${type === "danger" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground leading-tight">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            {description}
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                type === "danger"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-warning text-warning-foreground hover:bg-warning/90"
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
