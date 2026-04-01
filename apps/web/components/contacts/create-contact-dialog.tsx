"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { X, User, Phone, Mail, Tag, Save } from "lucide-react"
import { createSalonCustomer, type CreateSalonCustomerInput } from "@/app/actions/customers"
import type { CustomerRow } from "@/app/actions/customers"

interface CreateContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  onSuccess?: (customer: CustomerRow) => void
}

export function CreateContactDialog({
  open,
  onOpenChange,
  salonId,
  onSuccess,
}: CreateContactDialogProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [preferences, setPreferences] = useState("")
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

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

    const input: CreateSalonCustomerInput = {
      salonId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      preferences: preferences.trim() || undefined,
    }

    startTransition(async () => {
      const result = await createSalonCustomer(input)

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Contato criado com sucesso!")
        // Limpa o formulário
        setName("")
        setPhone("")
        setEmail("")
        setPreferences("")
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
      // Limpa o formulário ao fechar
      setName("")
      setPhone("")
      setEmail("")
      setPreferences("")
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop - dark and blurry to focus on the modal */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={handleClose} 
      />
      
      {/* Modal Card - Solid bg to avoid transparency issues, defined borders and deep shadow */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
              <User size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Novo Contato</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Cadastro de cliente</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            disabled={isPending}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Nome Completo <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <User size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Nome do cliente" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  required
                  minLength={2}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <Phone size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="tel" 
                    placeholder="(00) 00000-0000" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isPending}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">E-mail</label>
                <div className="relative group">
                  <Mail size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="email" 
                    placeholder="cliente@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isPending}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Observações / Preferências</label>
              <div className="relative group">
                <Tag size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <textarea 
                  rows={3} 
                  placeholder="Ex: Gosta de café, prefere cortes tesoura..." 
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50/30 dark:bg-white/[0.01]">
            <button 
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Save size={18} />
              {isPending ? "Criando..." : "Salvar Contato"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
