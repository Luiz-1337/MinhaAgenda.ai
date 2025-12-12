"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createSalon } from "@/app/actions/salon"
import { createSalonSchema, type CreateSalonSchema } from "@/lib/schemas"
import { X, Check, MapPin, Phone, MessageCircle, Clock, CreditCard, Car, AlertCircle, Store } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const form = useForm<CreateSalonSchema>({
    resolver: zodResolver(createSalonSchema),
    defaultValues: {
      name: "",
      slug: "",
      address: "",
      phone: "",
      whatsapp: "",
      description: "",
      workHours: {},
      settings: {
        accepts_card: false,
        parking: false,
        late_tolerance_minutes: 10,
        cancellation_policy: "",
      },
    },
    mode: "onChange",
  })

  function onSubmit(values: CreateSalonSchema) {
    startTransition(async () => {
      // Processa workHours: filtra apenas dias com horários válidos
      const workHoursObj: Record<string, { start: string; end: string }> | undefined = 
        values.workHours && typeof values.workHours === 'object'
          ? Object.entries(values.workHours).reduce((acc, [day, hours]) => {
              if (hours && typeof hours === 'object' && 'start' in hours && 'end' in hours && hours.start && hours.end) {
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

      const res = await createSalon({
        name: values.name.trim(),
        slug: values.slug.trim().toLowerCase(),
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
      
      toast.success("Salão criado com sucesso")
      if (res.data?.salonId) {
        router.replace(`/${res.data.salonId}/dashboard`)
        router.refresh()
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 font-sans">
      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 rounded-t-2xl backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
              <Store size={20} className="text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Cadastrar Salão</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Informe os dados do seu novo estabelecimento.</p>
            </div>
          </div>
        </div>

        {/* Scrollable Form Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white dark:bg-slate-900">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            {/* Section: Basic Info */}
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Nome do Salão <span className="text-indigo-500">*</span>
                </label>
                <input 
                  type="text" 
                  {...form.register("name")}
                  placeholder="Ex: Barber Club Premium" 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  URL Personalizada (Slug) <span className="text-indigo-500">*</span>
                </label>
                <div className="flex rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 overflow-hidden focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                  <span className="px-4 py-3 text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-white/5 bg-white/50 dark:bg-white/5 select-none text-xs font-mono flex items-center">minhaagenda.ai/</span>
                  <input 
                    type="text" 
                    {...form.register("slug")}
                    placeholder="meu-salao" 
                    className="flex-1 bg-transparent px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none text-sm"
                  />
                </div>
                {form.formState.errors.slug && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">{form.formState.errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Descrição</label>
                <textarea 
                  rows={3}
                  {...form.register("description")}
                  placeholder="Descreva seu salão, especialidades e ambiente..." 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none text-sm"
                />
              </div>
            </div>

            {/* Section: Contact */}
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
                <MapPin size={16} className="text-indigo-500 dark:text-indigo-400" /> Localização & Contato
              </h3>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Endereço Completo</label>
                <input 
                  type="text" 
                  {...form.register("address")}
                  placeholder="Rua Exemplo, 123 - Bairro, Cidade - UF" 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Telefone</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-4 top-3.5 text-slate-500 dark:text-slate-400" />
                    <input 
                      type="text" 
                      {...form.register("phone")}
                      placeholder="(11) 0000-0000" 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">WhatsApp</label>
                  <div className="relative">
                    <MessageCircle size={16} className="absolute left-4 top-3.5 text-slate-500 dark:text-slate-400" />
                    <input 
                      type="text" 
                      {...form.register("whatsapp")}
                      placeholder="(11) 99999-9999" 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                    />
                  </div>
                  {form.formState.errors.whatsapp && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{form.formState.errors.whatsapp.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Hours */}
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
                <Clock size={16} className="text-indigo-500 dark:text-indigo-400" /> Horário de Funcionamento
              </h3>
              <div className="space-y-2">
                {DAYS_OF_WEEK.map((day) => {
                  const workHours = form.watch("workHours") || {}
                  // @ts-ignore
                  const dayHours = workHours[day.value]
                  const isActive = !!dayHours
                  const startTime = dayHours?.start || "09:00"
                  const endTime = dayHours?.end || "18:00"

                  return (
                    <div 
                      key={day.value} 
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-colors group"
                    >
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{day.label}</span>
                      <div className="flex items-center gap-3">
                        {isActive ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="time"
                              {...form.register(`workHours.${day.value}.start`)}
                              className="text-xs text-slate-700 dark:text-slate-300 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2 py-1 rounded focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
                            <input
                              type="time"
                              {...form.register(`workHours.${day.value}.end`)}
                              className="text-xs text-slate-700 dark:text-slate-300 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2 py-1 rounded focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-white/50 dark:bg-white/5 px-2 py-1 rounded">Fechado</span>
                        )}
                        <div 
                          className={cn(
                            "w-10 h-5 rounded-full relative cursor-pointer transition-colors",
                            isActive 
                              ? "bg-indigo-500/20 dark:bg-indigo-500/30 hover:bg-indigo-500/30 dark:hover:bg-indigo-500/40"
                              : "bg-slate-200 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700"
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rawWorkHours = form.getValues("workHours") || {}
                            const updatedWorkHours = { ...rawWorkHours } as Record<string, any>
                            if (isActive) {
                              delete updatedWorkHours[day.value]
                            } else {
                              updatedWorkHours[day.value] = { start: "09:00", end: "18:00" }
                            }
                            const valueToSet = Object.keys(updatedWorkHours).length > 0 
                              ? updatedWorkHours 
                              : undefined
                            form.setValue("workHours", valueToSet as any, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            })
                          }}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full shadow-sm transition-all",
                            isActive
                              ? "right-0.5 bg-indigo-500 dark:bg-indigo-400"
                              : "left-0.5 bg-slate-400 dark:bg-slate-500"
                          )}></div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {form.formState.errors.workHours && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                  {form.formState.errors.workHours.message}
                </p>
              )}
            </div>

            {/* Section: Configs */}
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
                <AlertCircle size={16} className="text-indigo-500 dark:text-indigo-400" /> Configurações
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Toggle Card */}
                <div 
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 flex items-start gap-4 hover:border-indigo-500/20 transition-colors group cursor-pointer"
                  onClick={() => form.setValue("settings.accepts_card", !form.watch("settings.accepts_card"))}
                >
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:border-indigo-500/20 transition-colors">
                    <CreditCard size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm group-hover:text-slate-900 dark:group-hover:text-white">Aceita Cartão</span>
                      <div className={cn(
                        "w-8 h-4 rounded-full relative transition-colors",
                        form.watch("settings.accepts_card")
                          ? "bg-indigo-500/20 dark:bg-indigo-500/30"
                          : "bg-slate-200 dark:bg-slate-700/50"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full transition-all",
                          form.watch("settings.accepts_card")
                            ? "right-0.5 bg-indigo-500 dark:bg-indigo-400"
                            : "left-0.5 bg-slate-400 dark:bg-slate-500"
                        )}></div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">O salão aceita pagamentos via cartão de crédito e débito.</p>
                  </div>
                </div>

                {/* Toggle Parking */}
                <div 
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 flex items-start gap-4 hover:border-slate-300 dark:hover:border-white/10 transition-colors group cursor-pointer"
                  onClick={() => form.setValue("settings.parking", !form.watch("settings.parking"))}
                >
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors">
                    <Car size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm group-hover:text-slate-900 dark:group-hover:text-white">Estacionamento</span>
                      <div className={cn(
                        "w-8 h-4 rounded-full relative transition-colors",
                        form.watch("settings.parking")
                          ? "bg-indigo-500/20 dark:bg-indigo-500/30"
                          : "bg-slate-200 dark:bg-slate-700/50"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full transition-all",
                          form.watch("settings.parking")
                            ? "right-0.5 bg-indigo-500 dark:bg-indigo-400"
                            : "left-0.5 bg-slate-400 dark:bg-slate-500"
                        )}></div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">O salão {form.watch("settings.parking") ? "possui" : "não possui"} estacionamento próprio.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Tolerância de Atraso (minutos)</label>
                <input 
                  type="number" 
                  {...form.register("settings.late_tolerance_minutes", { valueAsNumber: true })}
                  defaultValue={10}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Política de Cancelamento</label>
                <textarea 
                  rows={2}
                  {...form.register("settings.cancellation_policy")}
                  placeholder="Ex: Cancelamentos devem ser feitos com pelo menos 24h de antecedência." 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none text-sm"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {isPending ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Criando...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Criar Salão
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

      </div>
    </div>
  )
}