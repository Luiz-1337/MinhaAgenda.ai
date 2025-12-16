"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Search, Plus, Zap, Pencil, Trash2, Clock, DollarSign, Tag } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getServices, upsertService, deleteService, getServiceLinkedProfessionals } from "@/app/actions/services"
import { getProfessionals } from "@/app/actions/professionals"
import type { ServiceRow } from "@/lib/types/service"
import type { ProfessionalRow } from "@/lib/types/professional"
import { useSalon } from "@/contexts/salon-context"

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive("Duração deve ser positiva"),
  price: z.number().positive("Preço deve ser positivo"),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string()).default([]),
})
type ServiceForm = z.infer<typeof serviceSchema>

interface ServiceListProps {
  salonId: string
}

export default function ServiceList({ salonId }: ServiceListProps) {
  const { activeSalon } = useSalon()
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
    resolver: zodResolver(serviceSchema) as any,
    defaultValues: { name: "", description: "", duration: 60, price: 0, isActive: true, professionalIds: [] },
  })

  useEffect(() => {
    if (!salonId) return

    setIsLoading(true)
    startTransition(async () => {
      try {
        const res = await getServices(salonId)
        // getServices agora retorna sempre um array ou lança um erro
        setList(res)
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
    form.reset({ name: "", description: "", duration: 60, price: 0, isActive: true, professionalIds: [] })
    setOpen(true)
  }

  async function openEdit(service: ServiceRow) {
    setEditing(service)
    
    // Carregar profissionais vinculados ao serviço
    let linkedProfessionalIds: string[] = []
    try {
      const linked = await getServiceLinkedProfessionals(service.id, salonId)
      if (!("error" in linked)) {
        linkedProfessionalIds = linked
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
      isActive: service.is_active,
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
      const res = await upsertService({ ...values, salonId, professionalIds: values.professionalIds || [] })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Serviço atualizado" : "Serviço criado")
      setOpen(false)
      setEditing(null)
      try {
        const again = await getServices(salonId)
        setList(again)
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
        setList(again)
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

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={24} className="text-slate-400" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Serviços</h2>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Plus size={16} />
              Criar serviço
            </button>
          </DialogTrigger>
          <DialogContent className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-white/10 rounded-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-slate-800 dark:text-white">
                {editing ? "Editar Serviço" : "Novo Serviço"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-700 dark:text-slate-300">Nome *</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Ex.: Corte Masculino"
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/10 focus:border-indigo-500/50"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-slate-700 dark:text-slate-300">Descrição</Label>
                <Input
                  id="description"
                  {...form.register("description")}
                  placeholder="Descrição do serviço"
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/10 focus:border-indigo-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration" className="text-slate-700 dark:text-slate-300">
                    Duração (minutos) *
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    {...form.register("duration", { valueAsNumber: true })}
                    placeholder="60"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/10 focus:border-indigo-500/50"
                  />
                  {form.formState.errors.duration && (
                    <p className="text-sm text-red-500">{form.formState.errors.duration.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price" className="text-slate-700 dark:text-slate-300">Preço (R$) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    {...form.register("price", { valueAsNumber: true })}
                    placeholder="50.00"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/10 focus:border-indigo-500/50"
                  />
                  {form.formState.errors.price && (
                    <p className="text-sm text-red-500">{form.formState.errors.price.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Switch {...form.register("isActive")} checked={form.watch("isActive")} />
                  Ativo
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="professionals" className="text-slate-700 dark:text-slate-300">
                  Profissionais Habilitados
                </Label>
                <div className="border border-slate-200 dark:border-white/10 rounded-lg bg-slate-50 dark:bg-slate-950">
                  {(() => {
                    const activeProfessionals = professionals.filter((p) => p.is_active)
                    if (activeProfessionals.length === 0) {
                      return (
                        <div className="p-3">
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Nenhum profissional ativo cadastrado
                          </p>
                        </div>
                      )
                    }
                    return (
                      <>
                        <div className="p-2 border-b border-slate-200 dark:border-white/10">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const allActiveIds = activeProfessionals.map((p) => p.id)
                              form.setValue("professionalIds", allActiveIds)
                            }}
                            className="w-full text-xs h-7 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
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
                                  className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-normal"
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
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {editing ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md p-2 rounded-xl border border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "active"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Ativos
          </button>
          <button
            onClick={() => setFilter("inactive")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "inactive"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Inativos
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar serviços..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-xs font-bold text-slate-500 uppercase tracking-wider">
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
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 flex-1 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Zap size={32} className="mb-3 opacity-50" />
              <p>Nenhum serviço encontrado.</p>
            </div>
          ) : (
            filteredServices.map((service, index) => (
              <div
                key={service.id}
                className={`grid grid-cols-12 gap-4 p-4 items-center border-b border-slate-100 dark:border-white/5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${
                  index % 2 === 0 ? "bg-transparent" : "bg-slate-50/30 dark:bg-white/[0.01]"
                }`}
              >
                <div className="col-span-3 pl-2 font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-2">
                  <Tag size={14} className="text-slate-400" />
                  {service.name}
                </div>

                <div className="col-span-4 text-slate-500 dark:text-slate-400 text-xs truncate" title={service.description || ""}>
                  {service.description || "—"}
                </div>

                <div className="col-span-1 text-slate-600 dark:text-slate-300 font-medium text-xs flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  {formatDuration(service.duration)}
                </div>

                <div className="col-span-1 text-slate-600 dark:text-slate-300 font-mono text-xs font-medium flex items-center gap-1">
                  <DollarSign size={12} className="text-emerald-500" />
                  {formatPrice(service.price)}
                </div>

                <div className="col-span-1">
                  {service.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-xs font-bold text-slate-400">
                      Inativo
                    </span>
                  )}
                </div>

                <div className="col-span-2 flex justify-end gap-2 pr-2">
                  <button
                    onClick={() => openEdit(service)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteClick(service)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Trash2 size={12} />
                    Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-white/10 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-white">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-700 dark:text-slate-300">
              Tem certeza que deseja remover o serviço <strong>"{serviceToDelete?.name}"</strong>?
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Esta ação não pode ser desfeita. O serviço será removido permanentemente.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setServiceToDelete(null)
              }}
              className="border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

