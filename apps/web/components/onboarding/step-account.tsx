"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { User, ArrowRight, Phone, MapPin, Building, FileText, ArrowLeft } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"

const accountSchema = z.object({
  firstName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  lastName: z.string().min(2, "Sobrenome deve ter pelo menos 2 caracteres"),
  phone: z.string().min(10, "Telefone inválido").regex(/^[\d\s\(\)\-\+]+$/, "Telefone deve conter apenas números e caracteres de formatação"),
  // Endereço de cobrança
  billingAddress: z.string().min(5, "Endereço deve ter pelo menos 5 caracteres"),
  billingPostalCode: z.string().regex(/^\d{5}-?\d{3}$/, "CEP inválido (formato: 00000-000)"),
  billingCity: z.string().min(2, "Cidade deve ter pelo menos 2 caracteres"),
  billingState: z.string().length(2, "UF deve ter 2 caracteres").toUpperCase(),
  billingCountry: z.string(),
  billingAddressComplement: z.string().optional(),
  // CPF
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

type AccountFormData = z.infer<typeof accountSchema> & {
  billingCountry: string // Garantir que sempre seja string, não opcional
  documentType: 'CPF' | 'CNPJ'
  document: string
}

interface StepAccountProps {
  onNext: () => void
  onBack: () => void
}

export function StepAccount({ onNext, onBack }: StepAccountProps) {
  const { data, setData } = useOnboardingStore()
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(accountSchema as any),
    defaultValues: {
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      phone: data.phone || "",
      billingAddress: data.billingAddress || "",
      billingPostalCode: data.billingPostalCode || "",
      billingCity: data.billingCity || "",
      billingState: data.billingState || "",
      billingCountry: data.billingCountry || "BR",
      billingAddressComplement: data.billingAddressComplement || "",
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

  const onSubmit = async (formData: AccountFormData) => {
    // Garantir que todos os campos obrigatórios estão preenchidos
    const dataToSave = {
      ...formData,
      billingCountry: formData.billingCountry || 'BR',
      billingAddressComplement: formData.billingAddressComplement || undefined,
    }
    setData(dataToSave)
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-foreground mb-2">Informações Pessoais</h3>
        <p className="text-muted-foreground text-sm">Preencha seus dados pessoais.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="firstName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nome <span className="text-accent">*</span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
              </div>
              <input
                id="firstName"
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                placeholder="Seu nome"
                {...register("firstName")}
              />
            </div>
            {errors.firstName && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lastName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sobrenome <span className="text-accent">*</span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
              </div>
              <input
                id="lastName"
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                placeholder="Seu sobrenome"
                {...register("lastName")}
              />
            </div>
            {errors.lastName && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Telefone <span className="text-accent">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Phone size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
            </div>
            <input
              id="phone"
              type="tel"
              className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              placeholder="(00) 00000-0000"
              {...register("phone")}
            />
          </div>
          {errors.phone && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.phone.message}</p>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building size={16} />
            Endereço para Cobrança
          </h4>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="billingAddress" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Endereço <span className="text-accent">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MapPin size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
            </div>
            <input
              id="billingAddress"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              placeholder="Rua, número, bairro"
              {...register("billingAddress")}
            />
          </div>
          {errors.billingAddress && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.billingAddress.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="billingPostalCode" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              CEP <span className="text-accent">*</span>
            </label>
            <input
              id="billingPostalCode"
              type="text"
              className="w-full px-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              placeholder="00000-000"
              {...register("billingPostalCode")}
            />
            {errors.billingPostalCode && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.billingPostalCode.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="billingCity" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cidade <span className="text-accent">*</span>
            </label>
            <input
              id="billingCity"
              type="text"
              className="w-full px-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              placeholder="Cidade"
              {...register("billingCity")}
            />
            {errors.billingCity && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.billingCity.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="billingState" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              UF <span className="text-accent">*</span>
            </label>
            <input
              id="billingState"
              type="text"
              maxLength={2}
              className="w-full px-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all uppercase"
              placeholder="SP"
              {...register("billingState", {
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase()
                }
              })}
            />
            {errors.billingState && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.billingState.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="billingAddressComplement" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Complemento
          </label>
          <input
            id="billingAddressComplement"
            type="text"
            className="w-full px-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
            placeholder="Apartamento, bloco, etc. (opcional)"
            {...register("billingAddressComplement")}
          />
          {errors.billingAddressComplement && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.billingAddressComplement.message}</p>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText size={16} />
            Dados Legais
          </h4>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="documentType" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tipo de Documento <span className="text-accent">*</span>
          </label>
          <Select
            value={documentType}
            onValueChange={(value) => setValue("documentType", value as "CPF" | "CNPJ", { shouldValidate: true })}
          >
            <SelectTrigger className="w-full bg-card border border-border rounded-md">
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
          <label htmlFor="document" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {documentType === "CPF" ? "CPF" : "CNPJ"} <span className="text-accent">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FileText size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
            </div>
            <input
              id="document"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
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
            className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200"
          >
            <ArrowLeft size={18} />
            Voltar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{isSubmitting ? "Processando..." : "Continuar"}</span>
            {!isSubmitting && <ArrowRight size={18} />}
          </button>
        </div>
      </form>
    </div>
  )
}
