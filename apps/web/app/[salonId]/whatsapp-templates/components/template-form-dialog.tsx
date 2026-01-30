"use client"

import { useState } from "react"
import { X, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface TemplateFormDialogProps {
  open: boolean
  onClose: () => void
  salonId: string
  onSuccess: () => void
}

type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION"

const CATEGORY_OPTIONS: { value: TemplateCategory; label: string; description: string }[] = [
  {
    value: "UTILITY",
    label: "Utilidade",
    description: "Confirmações, lembretes, atualizações de pedido",
  },
  {
    value: "MARKETING",
    label: "Marketing",
    description: "Promoções, ofertas, campanhas",
  },
  {
    value: "AUTHENTICATION",
    label: "Autenticação",
    description: "Códigos de verificação, OTP",
  },
]

const LANGUAGE_OPTIONS = [
  { value: "pt_BR", label: "Português (Brasil)" },
  { value: "en_US", label: "English (US)" },
  { value: "es", label: "Español" },
]

export function TemplateFormDialog({
  open,
  onClose,
  salonId,
  onSuccess,
}: TemplateFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [body, setBody] = useState("")
  const [category, setCategory] = useState<TemplateCategory>("UTILITY")
  const [language, setLanguage] = useState("pt_BR")
  const [header, setHeader] = useState("")
  const [footer, setFooter] = useState("")
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName("")
    setBody("")
    setCategory("UTILITY")
    setLanguage("pt_BR")
    setHeader("")
    setFooter("")
    setError(null)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validações
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, "_")
    if (!cleanName || cleanName.length < 3) {
      setError("Nome deve ter pelo menos 3 caracteres")
      return
    }

    if (!/^[a-z0-9_]+$/.test(cleanName)) {
      setError("Nome deve conter apenas letras, números e underscores")
      return
    }

    if (!body.trim() || body.trim().length < 10) {
      setError("Corpo da mensagem deve ter pelo menos 10 caracteres")
      return
    }

    // Validações de formato de variáveis
    if (body.startsWith("{{") || body.endsWith("}}")) {
      setError("Variáveis não podem estar no início ou fim da mensagem")
      return
    }

    if (/\}\}\s*\{\{/.test(body)) {
      setError("Variáveis adjacentes devem ter texto entre elas")
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          body: body.trim(),
          category,
          language,
          header: header.trim() || undefined,
          footer: footer.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erro ao criar template")
        return
      }

      toast.success("Template criado com sucesso!")
      resetForm()
      onSuccess()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            Criar Template
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-5">
            {/* Nome */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Nome do Template *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: confirmacao_agendamento"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use apenas letras minúsculas, números e underscores
              </p>
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Categoria *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCategory(opt.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      category === opt.value
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                    }`}
                  >
                    <span className={`text-sm font-medium ${
                      category === opt.value
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {opt.label}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Idioma */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Idioma
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Header (opcional) */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Cabeçalho <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                placeholder="ex: Confirmação de Agendamento"
                maxLength={60}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Corpo da Mensagem *
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Olá {{1}}! Seu agendamento para {{2}} foi confirmado para o dia {{3}} às {{4}}."
                rows={5}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use {"{{1}}"}, {"{{2}}"}, etc. para variáveis dinâmicas
              </p>
            </div>

            {/* Footer (opcional) */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Rodapé <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="ex: Responda CANCELAR para cancelar"
                maxLength={60}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Info */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-1">
                Dicas para aprovação
              </p>
              <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1 list-disc list-inside">
                <li>Não inicie ou termine a mensagem com variáveis</li>
                <li>Sempre tenha texto entre variáveis adjacentes</li>
                <li>Seja específico sobre o propósito da mensagem</li>
                <li>Evite conteúdo genérico ou spam</li>
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Criar Template
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
