"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Search, Plus, Zap, Clock, DollarSign, Tag, X, Save, ArrowLeftRight, Star } from "lucide-react"
import { ActionMenu } from "@/components/ui/action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getServices, upsertService, deleteService, getServiceLinkedProfessionals } from "@/app/actions/services"
import type { ServiceRow, PriceType } from "@/lib/types/service"
import type { ProfessionalRow } from "@/lib/types/professional"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"

const priceTypeSchema = z.enum(["fixed", "range"])

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive("Duração deve ser positiva"),
  durationMax: z.number().int().positive("Duração máxima deve ser positiva").nullable().optional(),
  price: z.number().nonnegative("Preço deve ser positivo"),
  priceType: priceTypeSchema.default("fixed"),
  priceMin: z.number().positive("Preço mínimo deve ser positivo").optional(),
  priceMax: z.number().positive("Preço máximo deve ser positivo").optional(),
  priceOnRequest: z.boolean().default(false),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
  allowedStartTimes: z.array(z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/)).default([]),
  isActive: z.boolean().default(true),
  averageCycleDays: z.number().int().positive("Informe um número de dias maior que zero").nullable().optional(),
  professionalIds: z.array(z.string()).default([]),
  specialistProfessionalIds: z.array(z.string()).default([]),
}).refine(
  (data) => {
    // "Sob avaliação" dispensa preço.
    if (data.priceOnRequest) return true
    if (data.priceType === "fixed") {
      return data.price > 0
    }
    if (data.priceType === "range") {
      return (
        data.priceMin !== undefined &&
        data.priceMax !== undefined &&
        data.priceMin > 0 &&
        data.priceMax > 0 &&
        data.priceMin <= data.priceMax
      )
    }
    return true
  },
  {
    message: "Para preço fixo, informe um valor positivo. Para range, o preço mínimo deve ser menor ou igual ao máximo.",
    path: ["price"],
  }
).refine(
  (data) => data.durationMax == null || data.durationMax >= data.duration,
  {
    message: "A duração máxima deve ser maior ou igual à duração.",
    path: ["durationMax"],
  }
)
type ServiceForm = z.infer<typeof serviceSchema>

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const

interface ServiceListProps {
  salonId: string
  initialServices: ServiceRow[]
  initialProfessionals: ProfessionalRow[]
}

export default function ServiceList({ salonId, initialServices, initialProfessionals }: ServiceListProps) {
  const { activeSalon } = useSalon()
  const { isSolo } = useSalonAuth()
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [list, setList] = useState<ServiceRow[]>(initialServices)
  const [professionals] = useState<ProfessionalRow[]>(initialProfessionals)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [, startTransition] = useTransition()
  const [isLoading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [serviceToDelete, setServiceToDelete] = useState<{ id: string; name: string } | null>(null)
  // Segundo passo: serviço com agendamentos vinculados (exige confirmação extra)
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false)
  const [forceDeleteMsg, setForceDeleteMsg] = useState("")
  const [newStartTime, setNewStartTime] = useState("")

  const form = useForm<ServiceForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(serviceSchema as any),
    defaultValues: { name: "", description: "", duration: 60, durationMax: null, price: 0, priceType: "fixed", priceMin: undefined, priceMax: undefined, priceOnRequest: false, allowedWeekdays: [], allowedStartTimes: [], isActive: true, averageCycleDays: null, professionalIds: [], specialistProfessionalIds: [] },
  })

  const filteredServices = useMemo(() => {
    return list.filter((service) => {
      const matchesFilter =
        filter === "all" ? true : filter === "active" ? service.is_active : !service.is_active

      const matchesSearch =
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (service.description && service.description.toLowerCase().includes(searchTerm.toLowerCase()))

      return matchesFilter && matchesSearch
    })
  }, [list, filter, searchTerm])

  function openCreate() {
    setEditing(null)
    setNewStartTime("")
    form.reset({ name: "", description: "", duration: 60, durationMax: null, price: 0, priceType: "fixed", priceMin: undefined, priceMax: undefined, priceOnRequest: false, allowedWeekdays: [], allowedStartTimes: [], isActive: true, averageCycleDays: null, professionalIds: [], specialistProfessionalIds: [] })
    setOpen(true)
  }

  async function openEdit(service: ServiceRow) {
    setEditing(service)

    // Carregar profissionais vinculados ao serviço
    let linkedProfessionalIds: string[] = []
    let linkedSpecialistIds: string[] = []
    try {
      const linked = await getServiceLinkedProfessionals(service.id, salonId)
      if ("error" in linked) {
        console.error("Erro ao carregar profissionais vinculados:", linked.error)
      } else {
        linkedProfessionalIds = linked.data?.professionalIds || []
        linkedSpecialistIds = linked.data?.specialistIds || []
      }
    } catch (error) {
      console.error("Erro ao carregar profissionais vinculados:", error)
    }

    setNewStartTime("")
    form.reset({
      id: service.id,
      name: service.name,
      description: service.description || "",
      duration: service.duration,
      durationMax: service.duration_max ?? null,
      price: parseFloat(service.price),
      priceType: service.price_type || "fixed",
      priceMin: service.price_min ? parseFloat(service.price_min) : undefined,
      priceMax: service.price_max ? parseFloat(service.price_max) : undefined,
      priceOnRequest: service.price_on_request ?? false,
      allowedWeekdays: service.allowed_weekdays ?? [],
      allowedStartTimes: service.allowed_start_times ?? [],
      isActive: service.is_active,
      averageCycleDays: service.average_cycle_days ?? null,
      professionalIds: linkedProfessionalIds,
      specialistProfessionalIds: linkedSpecialistIds,
    })
    setOpen(true)
  }

  async function onSubmit(values: ServiceForm) {
    if (!salonId) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await upsertService({
        ...values,
        salonId,
        professionalIds: values.professionalIds || [],
        specialistProfessionalIds: values.specialistProfessionalIds || [],
        priceType: values.priceType,
        priceMin: values.priceType === "range" ? values.priceMin : undefined,
        priceMax: values.priceType === "range" ? values.priceMax : undefined,
        priceOnRequest: values.priceOnRequest ?? false,
        durationMax: values.durationMax ?? null,
        allowedWeekdays: values.allowedWeekdays ?? [],
        allowedStartTimes: values.allowedStartTimes ?? [],
        averageCycleDays: values.averageCycleDays ?? null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Serviço atualizado" : "Serviço criado")
      setOpen(false)
      setEditing(null)
      try {
        const again = await getServices(salonId)
        if ("error" in again) {
          console.error("Erro ao recarregar serviços:", again.error)
        } else {
          setList(again.data || [])
        }
      } catch (error) {
        console.error("Erro ao recarregar serviços:", error)
      }
    })
  }

  function handleDeleteClick(service: ServiceRow) {
    setServiceToDelete({ id: service.id, name: service.name })
    setDeleteConfirmOpen(true)
  }

  async function reloadServices() {
    if (!salonId) return
    try {
      const again = await getServices(salonId)
      if ("error" in again) {
        console.error("Erro ao recarregar serviços:", again.error)
      } else {
        setList(again.data || [])
      }
    } catch (error) {
      console.error("Erro ao recarregar serviços:", error)
    }
  }

  async function onDelete() {
    if (!salonId || !serviceToDelete) {
      toast.error("Selecione um salão")
      return
    }

    const target = serviceToDelete
    setDeleteConfirmOpen(false)
    startTransition(async () => {
      const res = await deleteService(target.id, salonId)
      if ("error" in res) {
        // Serviço com agendamentos: pede confirmação extra antes de apagar tudo.
        if (res.code === "HAS_APPOINTMENTS") {
          setForceDeleteMsg(res.error)
          setForceDeleteOpen(true)
          return
        }
        toast.error(res.error)
        setServiceToDelete(null)
        return
      }
      toast.success("Serviço removido")
      setServiceToDelete(null)
      await reloadServices()
    })
  }

  // Confirmação extra: apaga o serviço E seus agendamentos vinculados.
  async function onForceDelete() {
    if (!salonId || !serviceToDelete) {
      toast.error("Selecione um salão")
      return
    }

    const target = serviceToDelete
    setForceDeleteOpen(false)
    startTransition(async () => {
      const res = await deleteService(target.id, salonId, true)
      if ("error" in res) {
        toast.error(res.error)
        setServiceToDelete(null)
        return
      }
      toast.success("Serviço e agendamentos removidos")
      setServiceToDelete(null)
      await reloadServices()
    })
  }

  function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`
  }

  function formatPrice(price: string): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(parseFloat(price))
  }

  function formatServicePrice(service: ServiceRow): string {
    if (service.price_on_request) return "Sob avaliação"
    if (service.price_type === "range" && service.price_min && service.price_max) {
      const min = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(service.price_min))
      const max = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(service.price_max))
      return `${min} - ${max}`
    }
    return formatPrice(service.price)
  }

  function formatServiceDuration(service: ServiceRow): string {
    if (service.duration_max && service.duration_max > service.duration) {
      return `${formatDuration(service.duration)} a ${formatDuration(service.duration_max)}`
    }
    return formatDuration(service.duration)
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={24} className="text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Serviços</h2>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors shadow-md"
        >
          <Plus size={16} />
          Criar serviço
        </button>
      </div>

      {/* Service Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">{editing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          {/* Header */}
          <div className="p-6 border-b border-border flex justify-between items-center bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg text-primary-foreground shadow-md">
                <Zap size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground tracking-tight">
                  {editing ? "Editar Serviço" : "Novo Serviço"}
                </h2>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Configuração de oferta</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              disabled={form.formState.isSubmitting}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome do Serviço <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Corte Degrade"
                  {...form.register("name")}
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição Detalhada</label>
                <textarea
                  rows={3}
                  placeholder="Descreva o que está incluso no serviço..."
                  {...form.register("description")}
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Duração (min) <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (form.watch("durationMax") != null) {
                        form.setValue("durationMax", null)
                      } else {
                        form.setValue("durationMax", form.getValues("duration") || 0)
                      }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  >
                    <ArrowLeftRight size={12} />
                    {form.watch("durationMax") != null ? "Usar duração única" : "Usar faixa de duração"}
                  </button>
                </div>
                {form.watch("durationMax") != null ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative group">
                      <Clock size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                      <input
                        type="number"
                        placeholder="Mínimo (min)"
                        {...form.register("duration", { valueAsNumber: true })}
                        className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                      />
                    </div>
                    <div className="relative group">
                      <Clock size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                      <input
                        type="number"
                        placeholder="Máximo (min)"
                        {...form.register("durationMax", { setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)) })}
                        className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative group">
                    <Clock size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                    <input
                      type="number"
                      placeholder="30 min"
                      {...form.register("duration", { valueAsNumber: true })}
                      className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                    />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Em faixa (ex.: &quot;6h a 7h&quot;), a agenda reserva o maior tempo para não encavalar.
                </p>
                {form.formState.errors.duration && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.duration.message}</p>
                )}
                {form.formState.errors.durationMax && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.durationMax.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ciclo de retorno ideal (dias)
                </label>
                <div className="relative group">
                  <Clock size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <input
                    type="number"
                    placeholder="Ex: 30 (corte), 90 (mechas) — em branco usa o default global"
                    {...form.register("averageCycleDays", {
                      setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                    })}
                    className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Usado pela IA de retenção: cliente é considerado inativo após esse número de dias sem fazer este serviço. Deixe em branco para usar o padrão do salão.
                </p>
                {form.formState.errors.averageCycleDays && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.averageCycleDays.message}</p>
                )}
              </div>

              {/* Preço - fixo / faixa / sob avaliação */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Preço (R$){!form.watch("priceOnRequest") && <span className="text-red-600 dark:text-red-400"> *</span>}
                  </label>
                  {!form.watch("priceOnRequest") && (
                    <button
                      type="button"
                      onClick={() => {
                        const currentType = form.watch("priceType")
                        const newType = currentType === "fixed" ? "range" : "fixed"
                        form.setValue("priceType", newType)
                        if (newType === "fixed") {
                          form.setValue("priceMin", undefined)
                          form.setValue("priceMax", undefined)
                        } else {
                          form.setValue("price", 0)
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                    >
                      <ArrowLeftRight size={12} />
                      {form.watch("priceType") === "fixed" ? "Usar faixa de preço" : "Usar preço fixo"}
                    </button>
                  )}
                </div>

                <Label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Switch
                    checked={form.watch("priceOnRequest")}
                    onCheckedChange={(v) => form.setValue("priceOnRequest", v, { shouldDirty: true, shouldValidate: true })}
                  />
                  <span>Sob avaliação (valor definido no atendimento)</span>
                </Label>

                {form.watch("priceOnRequest") ? (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    A IA informa que o valor é &quot;sob avaliação&quot; (sem inventar preço) e ainda assim permite agendar.
                  </p>
                ) : form.watch("priceType") === "fixed" ? (
                  <div className="relative group">
                    <DollarSign size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      {...form.register("price", { valueAsNumber: true })}
                      className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative group">
                      <DollarSign size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Mínimo"
                        {...form.register("priceMin", { valueAsNumber: true })}
                        className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                      />
                    </div>
                    <div className="relative group">
                      <DollarSign size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Máximo"
                        {...form.register("priceMax", { valueAsNumber: true })}
                        className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                      />
                    </div>
                  </div>
                )}
                {form.formState.errors.price && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.price.message}</p>
                )}
                {form.formState.errors.priceMin && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.priceMin.message}</p>
                )}
                {form.formState.errors.priceMax && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.priceMax.message}</p>
                )}
              </div>

              {/* Disponibilidade do serviço: dias e horários de início específicos */}
              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dias de atendimento</label>
                  <p className="text-[11px] text-muted-foreground">Em quais dias este serviço é realizado. Vazio = todos os dias.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((label, day) => {
                    const days = form.watch("allowedWeekdays") || []
                    const active = days.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const current = form.getValues("allowedWeekdays") || []
                          if (current.includes(day)) {
                            form.setValue("allowedWeekdays", current.filter((d) => d !== day))
                          } else {
                            form.setValue("allowedWeekdays", [...current, day].sort((a, b) => a - b))
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${active ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horários de início específicos</label>
                  <p className="text-[11px] text-muted-foreground">Se informado, o serviço só pode começar nesses horários. Vazio = horários contínuos.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(newStartTime)) return
                      const current = form.getValues("allowedStartTimes") || []
                      if (!current.includes(newStartTime)) {
                        form.setValue("allowedStartTimes", [...current, newStartTime].sort())
                      }
                      setNewStartTime("")
                    }}
                    className="h-9 text-xs border-border hover:bg-muted"
                  >
                    <Plus size={14} /> Adicionar
                  </Button>
                </div>
                {(form.watch("allowedStartTimes") || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(form.watch("allowedStartTimes") || []).map((time) => (
                      <span key={time} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-medium text-foreground border border-border">
                        {time}
                        <button
                          type="button"
                          onClick={() => {
                            const current = form.getValues("allowedStartTimes") || []
                            form.setValue("allowedStartTimes", current.filter((t) => t !== time))
                          }}
                          className="text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Switch
                    checked={form.watch("isActive")}
                    onCheckedChange={(v) => form.setValue("isActive", v, { shouldDirty: true })}
                  />
                  <span>Ativo</span>
                </Label>
              </div>

              {!isSolo && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Profissionais Habilitados
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Marque a estrela para definir o especialista do serviço — a IA oferece esse profissional primeiro, mas pode agendar com outro habilitado se o cliente pedir.
                  </p>
                  <div className="border border-border rounded-md bg-card">
                    {(() => {
                      const activeProfessionals = professionals.filter((p) => p.is_active)
                      if (activeProfessionals.length === 0) {
                        return (
                          <div className="p-3">
                            <p className="text-sm text-muted-foreground">
                              Nenhum profissional ativo cadastrado
                            </p>
                          </div>
                        )
                      }
                      return (
                        <>
                          <div className="p-2 border-b border-border">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const allActiveIds = activeProfessionals.map((p) => p.id)
                                form.setValue("professionalIds", allActiveIds)
                              }}
                              className="w-full text-xs h-7 border-border hover:bg-muted"
                            >
                              Selecionar todos
                            </Button>
                          </div>
                          <div className="max-h-48 overflow-y-auto p-3 space-y-2">
                            {activeProfessionals.map((professional) => {
                              const professionalIds = form.watch("professionalIds") || []
                              const specialistIds = form.watch("specialistProfessionalIds") || []
                              const isChecked = professionalIds.includes(professional.id)
                              const isSpecialist = specialistIds.includes(professional.id)
                              return (
                                <div key={professional.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`professional-${professional.id}`}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const currentIds = form.getValues("professionalIds") || []
                                      if (e.target.checked) {
                                        form.setValue("professionalIds", [...currentIds, professional.id])
                                      } else {
                                        form.setValue(
                                          "professionalIds",
                                          currentIds.filter((id) => id !== professional.id)
                                        )
                                        // Ao desmarcar, remove também da lista de especialistas
                                        const currentSpecialists = form.getValues("specialistProfessionalIds") || []
                                        form.setValue(
                                          "specialistProfessionalIds",
                                          currentSpecialists.filter((id) => id !== professional.id)
                                        )
                                      }
                                    }}
                                  />
                                  <Label
                                    htmlFor={`professional-${professional.id}`}
                                    className="text-sm text-foreground cursor-pointer font-normal flex-1"
                                  >
                                    {professional.name}
                                  </Label>
                                  {isChecked && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentSpecialists = form.getValues("specialistProfessionalIds") || []
                                        if (currentSpecialists.includes(professional.id)) {
                                          form.setValue(
                                            "specialistProfessionalIds",
                                            currentSpecialists.filter((id) => id !== professional.id)
                                          )
                                        } else {
                                          form.setValue("specialistProfessionalIds", [
                                            ...currentSpecialists,
                                            professional.id,
                                          ])
                                        }
                                      }}
                                      title={
                                        isSpecialist
                                          ? "Especialista neste serviço (a IA oferece primeiro)"
                                          : "Marcar como especialista neste serviço"
                                      }
                                      className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                                        isSpecialist
                                          ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950"
                                          : "text-muted-foreground hover:bg-muted"
                                      }`}
                                    >
                                      <Star
                                        size={12}
                                        className={isSpecialist ? "fill-amber-500 text-amber-500" : ""}
                                      />
                                      Especialista
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              {isSolo && (
                <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
                  <p className="text-sm text-accent">
                    No plano SOLO, os serviços são automaticamente vinculados a você.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/30">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={form.formState.isSubmitting}
                className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {form.formState.isSubmitting ? "Salvando..." : editing ? "Salvar Serviço" : "Criar Serviço"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-2 rounded-md border border-border">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "active"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ativos
          </button>
          <button
            onClick={() => setFilter("inactive")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "inactive"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Inativos
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar serviços..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden bg-card rounded-md border border-border flex flex-col">
        {/* Table Header - Hidden on mobile */}
        <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-3 pl-2">Nome</div>
          <div className="col-span-4">Descrição</div>
          <div className="col-span-1">Duração</div>
          <div className="col-span-1">Preço</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2 text-right pr-2">Ações</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-4 flex-1 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Zap size={32} className="mb-3 opacity-50" />
              <p>Nenhum serviço encontrado.</p>
            </div>
          ) : (
            filteredServices.map((service, index) => (
              <div
                key={service.id}
                className={`flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-4 items-start md:items-center border-b border-border text-sm transition-colors hover:bg-muted ${
                  index % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                }`}
              >
                <div className="md:col-span-3 md:pl-2 font-semibold text-foreground truncate flex items-center gap-2 w-full md:w-auto">
                  <Tag size={14} className="text-muted-foreground flex-shrink-0" />
                  {service.name}
                </div>

                <div className="md:col-span-4 text-muted-foreground text-xs truncate w-full md:w-auto" title={service.description || ""}>
                  <span className="text-xs text-muted-foreground md:hidden font-medium">Descrição: </span>
                  {service.description || "—"}
                </div>

                <div className="md:col-span-1 text-foreground font-medium text-xs flex items-center gap-1">
                  <Clock size={12} className="text-muted-foreground" />
                  {formatServiceDuration(service)}
                </div>

                <div className="md:col-span-1 text-foreground font-mono text-xs font-medium flex items-center gap-1">
                  <DollarSign size={12} className="text-emerald-600 dark:text-emerald-400" />
                  {formatServicePrice(service)}
                </div>

                <div className="md:col-span-1 flex items-center gap-2">
                  {service.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted border border-border text-xs font-bold text-muted-foreground">
                      Inativo
                    </span>
                  )}
                </div>

                <div className="md:col-span-2 flex justify-end md:pr-2 w-full md:w-auto">
                  <ActionMenu
                    onEdit={() => openEdit(service)}
                    onDelete={() => handleDeleteClick(service)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dialog de Confirmação de Exclusão */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setServiceToDelete(null)
        }}
        onConfirm={onDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja remover o serviço "${serviceToDelete?.name}"? Esta ação não pode ser desfeita. O serviço será removido permanentemente.`}
        confirmText="Remover"
        type="danger"
      />

      {/* Confirmação extra: serviço possui agendamentos vinculados */}
      <ConfirmModal
        open={forceDeleteOpen}
        onClose={() => {
          setForceDeleteOpen(false)
          setServiceToDelete(null)
        }}
        onConfirm={onForceDelete}
        title="Serviço possui agendamentos"
        description={forceDeleteMsg}
        confirmText="Excluir mesmo assim"
        type="danger"
      />
    </div>
  )
}
