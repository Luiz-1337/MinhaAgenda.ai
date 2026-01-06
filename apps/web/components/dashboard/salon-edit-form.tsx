"use client"

import { useTransition, useEffect, forwardRef, useImperativeHandle } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateSalon } from "@/app/actions/salon"
import { updateSalonSchema, type UpdateSalonSchema } from "@/lib/schemas"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Store, MapPin, Phone, MessageCircle, Clock, AlertCircle, CreditCard, Car } from "lucide-react"
import type { SalonDetails } from "@/app/actions/salon"

export interface SalonEditFormRef {
  submit: () => void
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo", short: "Dom" },
  { value: "1", label: "Segunda-feira", short: "Seg" },
  { value: "2", label: "Terça-feira", short: "Ter" },
  { value: "3", label: "Quarta-feira", short: "Qua" },
  { value: "4", label: "Quinta-feira", short: "Qui" },
  { value: "5", label: "Sexta-feira", short: "Sex" },
  { value: "6", label: "Sábado", short: "Sáb" },
] as const

interface SalonEditFormProps {
  salon: SalonDetails
  salonId: string
  onPendingChange?: (isPending: boolean) => void
}

export const SalonEditForm = forwardRef<SalonEditFormRef, SalonEditFormProps>(
  ({ salon, salonId, onPendingChange }, ref) => {
  const [isPending, startTransition] = useTransition()

  // Notifica o componente pai sobre mudanças no estado isPending
  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  const form = useForm<UpdateSalonSchema>({
    resolver: zodResolver(updateSalonSchema),
    defaultValues: {
      name: salon.name || "",
      address: salon.address || "",
      phone: salon.phone || "",
      whatsapp: salon.whatsapp || "",
      description: salon.description || "",
      workHours: salon.workHours || {},
      settings: salon.settings || {
        accepts_card: false,
        parking: false,
        late_tolerance_minutes: 10,
        cancellation_policy: "",
      },
    },
    mode: "onChange",
  })

  // Atualiza o formulário quando o salão ou salonId mudar
  useEffect(() => {
    form.reset({
      name: salon.name || "",
      address: salon.address || "",
      phone: salon.phone || "",
      whatsapp: salon.whatsapp || "",
      description: salon.description || "",
      workHours: salon.workHours || {},
      settings: salon.settings || {
        accepts_card: false,
        parking: false,
        late_tolerance_minutes: 10,
        cancellation_policy: "",
      },
    })
  }, [salon.id, salonId, form])

  function onSubmit(values: UpdateSalonSchema) {
    startTransition(async () => {
      // Processa workHours: filtra apenas dias com horários válidos
      const workHoursObj: Record<string, { start: string; end: string }> | undefined = 
        values.workHours && typeof values.workHours === 'object'
          ? Object.entries(values.workHours).reduce((acc, [day, hours]) => {
              if (
                hours && 
                typeof hours === 'object' && 
                'start' in hours && 
                'end' in hours && 
                typeof hours.start === 'string' && 
                typeof hours.end === 'string' &&
                hours.start && 
                hours.end
              ) {
                acc[day] = { start: hours.start, end: hours.end }
              }
              return acc
            }, {} as Record<string, { start: string; end: string }>)
          : undefined

      // Processa settings: remove campos vazios
      const settingsObj = values.settings && typeof values.settings === 'object'
        ? Object.entries(values.settings).reduce((acc, [key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              acc[key] = value
            }
            return acc
          }, {} as Record<string, unknown>)
        : undefined

      const res = await updateSalon(salonId, {
        name: values.name.trim(),
        address: (values.address || "").trim(),
        phone: (values.phone || "").trim(),
        whatsapp: (values.whatsapp || "").trim(),
        description: (values.description || "").trim(),
        workHours: workHoursObj && Object.keys(workHoursObj).length > 0 ? workHoursObj : undefined,
        settings: settingsObj && Object.keys(settingsObj).length > 0 ? settingsObj : undefined,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success("Salão atualizado com sucesso")
      window.location.reload()
    })
  }

  // Expõe métodos para o componente pai
  useImperativeHandle(ref, () => ({
    submit: () => {
      form.handleSubmit(onSubmit)()
    },
  }))

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <form onSubmit={form.handleSubmit(onSubmit)}>

        {/* Grid Principal - Bento Style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Coluna Principal - 2 colunas */}
          <div className="lg:col-span-2 space-y-4">
            {/* Card 1: Identidade */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Dados da Unidade</h3>
              <div className="space-y-3">
                {/* Nome do Estabelecimento */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Nome do Estabelecimento
                  </label>
                  <input
                    type="text"
                    {...form.register("name")}
                    placeholder="Ex.: Barber Club"
                    className="w-full h-9 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>

                {/* Bio abaixo */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Bio / Descrição
                  </label>
                  <textarea
                    rows={2}
                    {...form.register("description")}
                    placeholder="Descreva seu salão..."
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Localização e Contato */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <MapPin size={14} className="text-indigo-500" /> Localização & Contato
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Endereço ocupa 2 colunas */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Endereço</label>
                  <input
                    type="text"
                    {...form.register("address")}
                    placeholder="Rua Exemplo, 123"
                    className="w-full h-9 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>

                {/* Telefone e WhatsApp lado a lado */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Telefone</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      {...form.register("phone")}
                      placeholder="(11) 90000-0000"
                      className="w-full h-9 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">WhatsApp</label>
                  <div className="relative">
                    <MessageCircle size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      {...form.register("whatsapp")}
                      placeholder="(11) 99999-9999"
                      className="w-full h-9 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                  {form.formState.errors.whatsapp && (
                    <p className="text-xs text-red-500">{form.formState.errors.whatsapp.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Regras de Negócio */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Regras de Negócio</h3>
              {/* Toggles lado a lado */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-2.5 rounded-lg border border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard size={12} className="text-slate-400" />
                    <span className="text-xs font-medium">Aceita Cartão</span>
                  </div>
                  <div
                    className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${
                      form.watch("settings.accepts_card")
                        ? "bg-emerald-500"
                        : "bg-slate-200 dark:bg-slate-800"
                    }`}
                    onClick={() =>
                      form.setValue("settings.accepts_card", !form.watch("settings.accepts_card"))
                    }
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                        form.watch("settings.accepts_card") ? "right-0.5" : "left-0.5"
                      }`}
                    ></div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Car size={12} className="text-slate-400" />
                    <span className="text-xs font-medium">Estacionamento</span>
                  </div>
                  <div
                    className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${
                      form.watch("settings.parking")
                        ? "bg-emerald-500"
                        : "bg-slate-200 dark:bg-slate-800"
                    }`}
                    onClick={() => form.setValue("settings.parking", !form.watch("settings.parking"))}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 bg-white dark:bg-slate-600 rounded-full transition-transform ${
                        form.watch("settings.parking") ? "right-0.5" : "left-0.5"
                      }`}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Tolerância e Cancelamento */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Tolerância de atraso (minutos)
                  </label>
                  <div className="relative w-32">
                    <Clock size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="number"
                      min="0"
                      {...form.register("settings.late_tolerance_minutes", { valueAsNumber: true })}
                      placeholder="15"
                      className="w-full h-9 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Política de Cancelamento
                  </label>
                  <textarea
                    rows={2}
                    {...form.register("settings.cancellation_policy")}
                    placeholder="Ex.: Cancelamentos devem ser feitos com pelo menos 24h de antecedência"
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Lateral - 1 coluna */}
          <div className="lg:col-span-1">
            {/* Card: Horário de Funcionamento */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <Clock size={14} className="text-indigo-500" /> Horário de Funcionamento
              </h3>
              <div className="space-y-2">
                {DAYS_OF_WEEK.map((day) => {
                  const workHours = form.watch("workHours") || {}
                  const dayHours = workHours[day.value as keyof typeof workHours]
                  const isActive = !!dayHours

                  return (
                    <div
                      key={day.value}
                      className="flex items-center gap-2 p-2 bg-slate-50/50 dark:bg-slate-950/50 rounded-lg border border-slate-200 dark:border-white/5"
                    >
                      {/* Switch pequeno */}
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => {
                          const currentWorkHours = (form.getValues("workHours") || {}) as Record<
                            string,
                            { start: string; end: string }
                          >
                          if (checked) {
                            form.setValue("workHours", {
                              ...currentWorkHours,
                              [day.value]: { start: "09:00", end: "18:00" },
                            } as UpdateSalonSchema["workHours"])
                          } else {
                            const { [day.value]: _, ...rest } = currentWorkHours
                            const validRest = Object.fromEntries(
                              Object.entries(rest as Record<string, { start: string; end: string }>).filter(([k]) =>
                                ["0", "1", "2", "3", "4", "5", "6"].includes(k)
                              )
                            ) as Partial<
                              Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { start: string; end: string }>
                            >
                            form.setValue(
                              "workHours",
                              Object.keys(validRest).length > 0
                                ? (validRest as UpdateSalonSchema["workHours"])
                                : undefined
                            )
                          }
                        }}
                      />
                      {/* Nome do dia abreviado */}
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 w-10">
                        {day.short}
                      </span>
                      {/* Inputs de horário */}
                      {isActive ? (
                        <>
                          <input
                            type="time"
                            {...form.register(`workHours.${day.value}.start`)}
                            className="flex-1 h-9 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                          />
                          <span className="text-[10px] text-slate-400">-</span>
                          <input
                            type="time"
                            {...form.register(`workHours.${day.value}.end`)}
                            className="flex-1 h-9 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                          />
                        </>
                      ) : (
                        <span className="flex-1 text-[10px] text-slate-400 italic">Fechado</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {form.formState.errors.workHours && (
                <p className="text-xs text-red-500 mt-2">{form.formState.errors.workHours.message}</p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  )
})

SalonEditForm.displayName = "SalonEditForm"

