"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { FileText, ArrowRight, ArrowLeft } from "lucide-react"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const legalSchema = z.object({
  documentType: z.enum(["CPF", "CNPJ"]),
  document: z.string().min(11, "Documento inválido"),
}).refine((data) => {
  if (data.documentType === "CPF") {
    return /^\d{11}$/.test(data.document.replace(/\D/g, ""))
  }
  if (data.documentType === "CNPJ") {
    return /^\d{14}$/.test(data.document.replace(/\D/g, ""))
  }
  return true
}, {
  message: "Documento inválido",
  path: ["document"],
})

type LegalFormData = z.infer<typeof legalSchema>

interface StepLegalProps {
  onNext: () => void
  onBack: () => void
}

export function StepLegal({ onNext, onBack }: StepLegalProps) {
  const { data, setData } = useOnboardingStore()
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LegalFormData>({
    resolver: zodResolver(legalSchema),
    defaultValues: {
      documentType: data.documentType || "CPF",
      document: data.document || "",
    },
  })

  const documentType = watch("documentType")

  const formatDocument = (value: string, type: "CPF" | "CNPJ") => {
    const numbers = value.replace(/\D/g, "")
    if (type === "CPF") {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    }
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  }

  const onSubmit = (formData: LegalFormData) => {
    setData(formData)
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Dados Legais</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Informe seu CPF ou CNPJ para continuar.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="documentType" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tipo de Documento <span className="text-indigo-500">*</span>
          </label>
          <Select
            value={documentType}
            onValueChange={(value) => setValue("documentType", value as "CPF" | "CNPJ", { shouldValidate: true })}
          >
            <SelectTrigger className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CPF">CPF</SelectItem>
              <SelectItem value="CNPJ">CNPJ</SelectItem>
            </SelectContent>
          </Select>
          {errors.documentType && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.documentType.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="document" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {documentType === "CPF" ? "CPF" : "CNPJ"} <span className="text-indigo-500">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FileText size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              id="document"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              placeholder={documentType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
              {...register("document", {
                onChange: (e) => {
                  const formatted = formatDocument(e.target.value, documentType)
                  setValue("document", formatted, { shouldValidate: true })
                },
              })}
            />
          </div>
          {errors.document && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.document.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-3.5 px-4 rounded-xl transition-all duration-200"
          >
            <ArrowLeft size={18} />
            Voltar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <span>{isSubmitting ? "Processando..." : "Continuar"}</span>
            {!isSubmitting && <ArrowRight size={18} />}
          </button>
        </div>
      </form>
    </div>
  )
}
