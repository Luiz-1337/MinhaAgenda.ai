"use client"

import { useTransition, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateSalon } from "@/app/actions/salon"
import { updateSalonSchema, type UpdateSalonSchema } from "@/lib/schemas"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Store, MapPin, Phone, MessageCircle, Clock, AlertCircle, CreditCard, Car } from "lucide-react"
import type { SalonDetails } from "@/app/actions/salon"

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
] as const

interface SalonEditFormProps {
  salon: SalonDetails
  salonId: string
}

export function SalonEditForm({ salon, salonId }: SalonEditFormProps) {
  const [isPending, startTransition] = useTransition()

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Identity Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-6 border-b border-slate-100 dark:border-white/5 pb-4">Dados da Unidade</h3>
          <div className="space-y-5">
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Nome do Estabelecimento</label>
              <input
                type="text"
                {...form.register("name")}
                placeholder="Ex.: Barber Club"
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Slug da URL</label>
              <div className="flex rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 overflow-hidden focus-within:border-indigo-500/50 transition-all">
                <span className="px-3 py-2 text-slate-400 bg-slate-100 dark:bg-white/5 text-[10px] font-mono flex items-center">minhaagenda.ai/</span>
                <input
                  type="text"
                  value={salon.slug}
                  disabled
                  className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Bio / Descrição</label>
              <textarea
                rows={2}
                {...form.register("description")}
                placeholder="Descreva seu salão..."
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* Location & Contact Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-indigo-500" /> Localização & Contato
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Endereço</label>
              <input
                type="text"
                {...form.register("address")}
                placeholder="Rua Exemplo, 123"
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Telefone</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  {...form.register("phone")}
                  placeholder="(11) 90000-0000"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">WhatsApp</label>
              <div className="relative">
                <MessageCircle size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  {...form.register("whatsapp")}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
              {form.formState.errors.whatsapp && (
                <p className="text-xs text-red-500">{form.formState.errors.whatsapp.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Work Hours Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Clock size={16} className="text-indigo-500" /> Horário de Funcionamento
          </h3>
          <div className="space-y-3">
            {DAYS_OF_WEEK.map((day) => {
              const workHours = form.watch("workHours") || {}
              const dayHours = workHours[day.value as keyof typeof workHours]
              const isActive = !!dayHours

              return (
                <div
                  key={day.value}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-white/5"
                >
                  <div className="flex items-center gap-2 min-w-[140px]">
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
                          // Remove the day from the workHours
                          const { [day.value]: _, ...rest } = currentWorkHours
                          // Only keep keys that are valid days ("0"-"6") and cast to correct type
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
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{day.label}</span>
                  </div>
                  {isActive && (
                    <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                      <input
                        type="time"
                        {...form.register(`workHours.${day.value}.start`)}
                        className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                      />
                      <span className="text-xs text-slate-500">até</span>
                      <input
                        type="time"
                        {...form.register(`workHours.${day.value}.end`)}
                        className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {form.formState.errors.workHours && (
            <p className="text-xs text-red-500 mt-2">{form.formState.errors.workHours.message}</p>
          )}
        </div>

        {/* Rules & Details Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Regras de Negócio</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2"><CreditCard size={14} className="text-slate-400" /><span className="text-xs font-medium">Aceita Cartão</span></div>
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

            <div className="p-3 rounded-xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2"><Car size={14} className="text-slate-400" /><span className="text-xs font-medium">Estacionamento</span></div>
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

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Tolerância de atraso (minutos)
              </label>
              <div className="relative w-32">
                <Clock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="number"
                  min="0"
                  {...form.register("settings.late_tolerance_minutes", { valueAsNumber: true })}
                  placeholder="15"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
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
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>
    </div>
  )
}

