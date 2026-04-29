"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Search, Plus, Zap, Clock, DollarSign, Tag, X, Save, ArrowLeftRight } from "lucide-react"
import { ActionMenu } from "@/components/ui/action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getServices, upsertService, deleteService, getServiceLinkedProfessionals } from "@/app/actions/services"
import { getProfessionals } from "@/app/actions/professionals"
import type { ServiceRow, PriceType } from "@/lib/types/service"
import type { ProfessionalRow } from "@/lib/types/professional"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"

const priceTypeSchema = z.enum(["fixed", "range"])

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive("Duração deve ser positiva"),
  price: z.number().nonnegative("Preço deve ser positivo"),
  priceType: priceTypeSchema.default("fixed"),
  priceMin: z.number().positive("Preço mínimo deve ser positivo").optional(),
  priceMax: z.number().positive("Preço máximo deve ser positivo").optional(),
  isActive: z.boolean().default(true),
  averageCycleDays: z.number().int().positive("Informe um número de dias maior que zero").nullable().optional(),
  professionalIds: z.array(z.string()).default([]),
}).refine(
  (data) => {
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
)
type ServiceForm = z.infer<typeof serviceSchema>

interface ServiceListProps {
  salonId: string
}

export default function ServiceList({ salonId }: ServiceListProps) {
  const { activeSalon } = useSalon()
  const { isSolo } = useSalonAuth()
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [list, setList] = useState<ServiceRow[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [serviceToDelete, setServiceToDelete] = useState<{ id: string; name: string } | null>(null)

  const form = useForm<ServiceForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(serviceSchema as any),
    defaultValues: { name: "", description: "", duration: 60, price: 0, priceType: "fixed", priceMin: undefined, priceMax: undefined, isActive: true, averageCycleDays: null, professionalIds: [] },
  })

  useEffect(() => {
    if (!salonId) return

    setIsLoading(true)
    startTransition(async () => {
      try {
        const res = await getServices(salonId)
        if ("error" in res) {
          console.error("Erro ao carregar serviços:", res.error)
          toast.error(res.error)
          setList([])
        } else {
          setList(res.data || [])
        }
      } catch (error) {
        console.error("Erro ao carregar serviços:", error)
        toast.error(error instanceof Error ? error.message : "Erro ao carregar serviços")
        setList([])
      } finally {
        setIsLoading(false)
      }
    })
  }, [salonId])

  // Carregar profissionais do salão
  useEffect(() => {
    if (!salonId) return

    startTransition(async () => {
      try {
        const res = await getProfessionals(salonId)
        if ("error" in res) {
          console.error("Erro ao carregar profissionais:", res.error)
          setProfessionals([])
        } else {
          setProfessionals(res)
        }
      } catch (error) {
        console.error("Erro ao carregar profissionais:", error)
        setProfessionals([])
      }
    })
  }, [salonId])

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
    form.reset({ name: "", description: "", duration: 60, price: 0, priceType: "fixed", priceMin: undefined, priceMax: undefined, isActive: true, averageCycleDays: null, professionalIds: [] })
    setOpen(true)
  }

  async function openEdit(service: ServiceRow) {
    setEditing(service)

    // Carregar profissionais vinculados ao serviço
    let linkedProfessionalIds: string[] = []
    try {
      const linked = await getServiceLinkedProfessionals(service.id, salonId)
      if ("error" in linked) {
        console.error("Erro ao carregar profissionais vinculados:", linked.error)
      } else {
        linkedProfessionalIds = linked.data || []
      }
    } catch (error) {
      console.error("Erro ao carregar profissionais vinculados:", error)
    }

    form.reset({
      id: service.id,
      name: service.name,
      description: service.description || "",
      duration: service.duration,
      price: parseFloat(service.price),
      priceType: service.price_type || "fixed",
      priceMin: service.price_min ? parseFloat(service.price_min) : undefined,
      priceMax: service.price_max ? parseFloat(service.price_max) : undefined,
      isActive: service.is_active,
      averageCycleDays: service.average_cycle_days ?? null,
      professionalIds: linkedProfessionalIds,
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
        priceType: values.priceType,
        priceMin: values.priceType === "range" ? values.priceMin : undefined,
        priceMax: values.priceType === "range" ? values.priceMax : undefined,
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

  async function onDelete() {
    if (!salonId || !serviceToDelete) {
      toast.error("Selecione um salão")
      return
    }

    setDeleteConfirmOpen(false)
    startTransition(async () => {
      const res = await deleteService(serviceToDelete.id, salonId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Serviço removido")
      setServiceToDelete(null)
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
    if (service.price_type === "range" && service.price_min && service.price_max) {
      const min = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(service.price_min))
      const max = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(service.price_max))
      return `${min} - ${max}`
    }
    return formatPrice(service.price)
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Duração (min) <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <div className="relative group">
                  <Clock size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <input
                    type="number"
                    placeholder="30 min"
                    {...form.register("duration", { valueAsNumber: true })}
                    className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                  />
                </div>
                {form.formState.errors.duration && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{form.formState.errors.duration.message}</p>
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

              {/* Preço - Toggle entre fixo e range */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Preço (R$) <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
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
                </div>

                {form.watch("priceType") === "fixed" ? (
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

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Switch {...form.register("isActive")} checked={form.watch("isActive")} />
                  <span>Ativo</span>
                </Label>
              </div>

              {!isSolo && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Profissionais Habilitados
                  </label>
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
                              const isChecked = professionalIds.includes(professional.id)
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
                                      }
                                    }}
                                  />
                                  <Label
                                    htmlFor={`professional-${professional.id}`}
                                    className="text-sm text-foreground cursor-pointer font-normal"
                                  >
                                    {professional.name}
                                  </Label>
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
                  {formatDuration(service.duration)}
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
    </div>
  )
}
