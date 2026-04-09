"use client"

import { useState, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { X, User, Phone, Mail, Tag, Save } from "lucide-react"
import { updateSalonCustomer, type UpdateSalonCustomerInput } from "@/app/actions/customers"
import type { CustomerRow } from "@/app/actions/customers"

interface EditContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  customer: CustomerRow | null
  onSuccess?: (customer: CustomerRow) => void
}

export function EditContactDialog({
  open,
  onOpenChange,
  salonId,
  customer,
  onSuccess,
}: EditContactDialogProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [preferences, setPreferences] = useState("")
  const [isPending, startTransition] = useTransition()

  // Preenche o formulário quando o customer muda
  useEffect(() => {
    if (customer) {
      setName(customer.name || "")
      setPhone(customer.phone || "")
      setEmail(customer.email || "")
      // Extrai notes das preferências se existir
      const prefs = customer.preferences as { notes?: string } | null
      setPreferences(prefs?.notes || "")
    }
  }, [customer])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!customer) {
      toast.error("Contato não selecionado")
      return
    }

    // Validação básica
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Nome deve ter pelo menos 2 caracteres")
      return
    }

    if (!phone.trim()) {
      toast.error("Telefone é obrigatório")
      return
    }

    if (email.trim() && !email.includes("@")) {
      toast.error("E-mail inválido")
      return
    }

    const input: UpdateSalonCustomerInput = {
      customerId: customer.id,
      salonId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      preferences: preferences.trim() || undefined,
    }

    startTransition(async () => {
      const result = await updateSalonCustomer(input)

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Contato atualizado com sucesso!")
        // Fecha o dialog
        onOpenChange(false)
        // Chama callback de sucesso
        if (onSuccess && result.data) {
          onSuccess(result.data)
        }
      }
    })
  }

  const handleClose = () => {
    if (!isPending) {
      onOpenChange(false)
    }
  }

  if (!open || !customer) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 z-30 animate-in fade-in duration-300"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-lg z-40 flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent rounded-md text-accent-foreground">
              <User size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight">Editar Contato</h2>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Atualizar informações</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Nome Completo <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="relative group">
                <User size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <input 
                  type="text" 
                  placeholder="Nome do cliente" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  required
                  minLength={2}
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Telefone <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <div className="relative group">
                  <Phone size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <input 
                    type="tel" 
                    placeholder="(00) 00000-0000" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isPending}
                    required
                    className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">E-mail</label>
                <div className="relative group">
                  <Mail size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <input 
                    type="email" 
                    placeholder="cliente@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isPending}
                    className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Observações / Preferências</label>
              <div className="relative group">
                <Tag size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <textarea 
                  rows={3} 
                  placeholder="Ex: Gosta de café, prefere cortes tesoura..." 
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/30">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-md text-sm font-bold flex items-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Save size={18} />
              {isPending ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


