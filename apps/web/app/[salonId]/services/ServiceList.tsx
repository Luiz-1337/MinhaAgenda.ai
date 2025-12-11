"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Pencil, Trash2, Scissors, Clock, DollarSign } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getServices, upsertService, deleteService } from "@/app/actions/services"
import type { ServiceRow } from "@/lib/types/service"
import { useSalon } from "@/contexts/salon-context"

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive("Duração deve ser positiva"),
  price: z.number().positive("Preço deve ser positivo"),
  isActive: z.boolean().default(true),
})
type ServiceForm = z.infer<typeof serviceSchema>

interface ServiceListProps {
  salonId: string
}

export default function ServiceList({ salonId }: ServiceListProps) {
  const { activeSalon } = useSalon()
  const [tab, setTab] = useState("todos")
  const [list, setList] = useState<ServiceRow[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema) as any,
    defaultValues: { name: "", description: "", duration: 60, price: 0, isActive: true },
  })

  useEffect(() => {
    if (!salonId) return
    
    setIsLoading(true)
    startTransition(async () => {
      const res = await getServices(salonId)
      if (Array.isArray(res)) {
        setList(res)
      } else {
        toast.error("Erro ao carregar serviços")
      }
      setIsLoading(false)
    })
  }, [salonId])

  const filtered = useMemo(() => {
    if (tab === "ativos") return list.filter((s) => s.is_active)
    if (tab === "inativos") return list.filter((s) => !s.is_active)
    return list
  }, [list, tab])

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", description: "", duration: 60, price: 0, isActive: true })
    setOpen(true)
  }

  function openEdit(service: ServiceRow) {
    setEditing(service)
    form.reset({
      id: service.id,
      name: service.name,
      description: service.description || "",
      duration: service.duration,
      price: parseFloat(service.price),
      isActive: service.is_active,
    })
    setOpen(true)
  }

  async function onSubmit(values: ServiceForm) {
    if (!salonId) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await upsertService({ ...values, salonId, professionalIds: [] })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Serviço atualizado" : "Serviço criado")
      setOpen(false)
      setEditing(null)
      const again = await getServices(salonId)
      if (Array.isArray(again)) setList(again)
    })
  }

  async function onDelete(id: string) {
    if (!salonId) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await deleteService(id, salonId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Serviço desativado")
      const again = await getServices(salonId)
      if (Array.isArray(again)) setList(again)
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Scissors className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="bg-teal-600 text-white hover:bg-teal-700">
              Criar serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...form.register("name")} placeholder="Ex.: Corte Masculino" />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" {...form.register("description")} placeholder="Descrição do serviço" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duração (minutos) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    {...form.register("duration", { valueAsNumber: true })}
                    placeholder="60"
                  />
                  {form.formState.errors.duration && (
                    <p className="text-sm text-destructive">{form.formState.errors.duration.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    {...form.register("price", { valueAsNumber: true })}
                    placeholder="50.00"
                  />
                  {form.formState.errors.price && (
                    <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Switch {...form.register("isActive")} checked={form.watch("isActive")} />
                  Ativo
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {editing ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="inativos">Inativos</TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                      <Skeleton className="h-10 w-32" />
                      <Skeleton className="h-10 flex-1" />
                      <Skeleton className="h-10 w-32" />
                      <Skeleton className="h-10 w-40" />
                      <Skeleton className="h-10 w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum serviço encontrado. Clique em "Criar serviço" para começar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.description || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="size-4" />
                              {formatDuration(s.duration)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <DollarSign className="size-4" />
                              {formatPrice(s.price)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {s.is_active ? (
                              <span className="bg-green-100 text-green-700 border-green-200 inline-flex rounded-md border px-2 py-1 text-xs">
                                Ativo
                              </span>
                            ) : (
                              <span className="bg-muted text-foreground/70 border-muted-foreground/20 inline-flex rounded-md border px-2 py-1 text-xs">
                                Inativo
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                                <Pencil className="size-4" />
                                Editar
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => onDelete(s.id)}>
                                <Trash2 className="size-4" />
                                Remover
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}

