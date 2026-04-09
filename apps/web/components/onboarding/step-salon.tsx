"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Store, MapPin, Phone, MessageCircle, Clock, ArrowRight, ArrowLeft } from "lucide-react"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
] as const

const workHoursDaySchema = z.object({
  start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido. Use HH:MM"),
  end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido. Use HH:MM"),
}).refine((data) => data.start < data.end, {
  message: "Horário de início deve ser anterior ao horário de fim",
  path: ["end"],
})

const salonSchema = z.object({
  salonName: z.string().min(3, "Nome do salão deve ter pelo menos 3 caracteres"),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  description: z.string().optional(),
  workHours: z.record(z.string(), workHoursDaySchema).optional(),
})

type SalonFormData = z.infer<typeof salonSchema>

interface StepSalonProps {
  onNext: () => void
  onBack: () => void
}

export function StepSalon({ onNext, onBack }: StepSalonProps) {
  const { data, setData } = useOnboardingStore()
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SalonFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(salonSchema as any),
    defaultValues: {
      salonName: data.salonName || "",
      address: data.address || "",
      phone: data.salonPhone || data.phone || "", // Usar salonPhone se existir, senão phone como fallback
      whatsapp: data.whatsapp || "",
      description: data.description || "",
      workHours: data.workHours || {},
    },
  })

  const workHours = watch("workHours") || {}

  const onSubmit = (formData: SalonFormData) => {
    // Mapear phone para salonPhone para evitar conflito com o phone pessoal do StepAccount
    const { phone, ...rest } = formData
    setData({
      ...rest,
      salonPhone: phone,
      salonName: formData.salonName,
    })
    onNext()
  }

  const toggleDay = (day: string) => {
    const current = workHours[day]
    if (current) {
      const { [day]: removed, ...rest } = workHours
      setValue("workHours", rest)
    } else {
      setValue("workHours", {
        ...workHours,
        [day]: { start: "09:00", end: "18:00" },
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-foreground mb-2">Detalhes do Salão</h3>
        <p className="text-muted-foreground text-sm">Complete as informações do seu estabelecimento.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-1.5">
          <label htmlFor="salonName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nome do Salão <span className="text-accent">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Store size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
            </div>
            <input
              id="salonName"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              placeholder="Barbearia do Silva"
              {...register("salonName")}
            />
          </div>
          {errors.salonName && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.salonName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="address" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Endereço
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MapPin size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
            </div>
            <input
              id="address"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              placeholder="Rua Exemplo, 123 - Bairro, Cidade - UF"
              {...register("address")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Telefone
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
              </div>
              <input
                id="phone"
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                placeholder="(11) 0000-0000"
                {...register("phone")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="whatsapp" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              WhatsApp
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MessageCircle size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
              </div>
              <input
                id="whatsapp"
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                placeholder="(11) 99999-9999"
                {...register("whatsapp")}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Descrição
          </label>
          <textarea
            id="description"
            rows={3}
            className="w-full px-4 py-3 bg-card border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all resize-none"
            placeholder="Descreva seu salão, especialidades e ambiente..."
            {...register("description")}
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Clock size={16} />
            Horário de Funcionamento
          </label>
          <div className="space-y-2">
            {DAYS_OF_WEEK.map((day) => {
              const dayHours = workHours[day.value]
              const isActive = !!dayHours

              return (
                <div
                  key={day.value}
                  className="flex items-center justify-between p-3 rounded-md bg-muted border border-border hover:border-border transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">{day.label}</span>
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <>
                        <input
                          type="time"
                          className="text-xs text-foreground font-mono bg-card border border-border px-2 py-1 rounded focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          {...register(`workHours.${day.value}.start`)}
                        />
                        <span className="text-muted-foreground">-</span>
                        <input
                          type="time"
                          className="text-xs text-foreground font-mono bg-card border border-border px-2 py-1 rounded focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          {...register(`workHours.${day.value}.end`)}
                        />
                        <button
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          className="text-xs px-3 py-1 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        >
                          Desativar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className="text-xs px-3 py-1 bg-muted text-foreground rounded hover:bg-muted/80 transition-colors"
                      >
                        Ativar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
