"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Scissors } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  deleteService,
  getServiceLinkedProfessionals,
  getServices,
  upsertService,
  type ServiceRow,
} from "@/app/actions/services"
import { getProfessionals, type ProfessionalRow } from "@/app/actions/professionals"

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  description: z.string().optional().or(z.literal("")),
  duration: z.coerce.number().int().positive("Duração em minutos"),
  price: z.coerce.number().positive("Preço inválido"),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string().uuid()).default([]),
})

type ServiceForm = z.infer<typeof serviceSchema>

type ServiceListProps = {
  salonId: string
}

export default function ServiceList({ salonId }: ServiceListProps) {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [isPending, startTransition] = useTransition()
  const [team, setTeam] = useState<ProfessionalRow[]>([])
  const [links, setLinks] = useState<Record<string, string[]>>({})

  const form = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema) as any,
    defaultValues: { name: "", description: "", duration: 30, price: 0, isActive: true },
  })

  useEffect(() => {
    let mounted = true
    startTransition(async () => {
      try {
        const list = await getServices(salonId)
        if (mounted) {
          setServices(list)
        }

        const map: Record<string, string[]> = {}
        for (const s of list) {
          const linked = await getServiceLinkedProfessionals(s.id)
          if (Array.isArray(linked)) {
            map[s.id] = linked
          }
        }
        if (mounted) {
          setLinks(map)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar serviços"
        toast.error(message)
      }

      const pros = await getProfessionals()
      if (mounted && Array.isArray(pros)) {
        setTeam(pros)
      }
    })

    return () => {
      mounted = false
    }
  }, [salonId])

  const currency = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }), [])

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", description: "", duration: 30, price: 0, isActive: true })
    setOpen(true)
  }

  function openEdit(s: ServiceRow) {
    setEditing(s)
    form.reset({
      id: s.id,
      name: s.name,
      description: s.description || "",
      duration: s.duration,
      price: Number(s.price),
      isActive: s.is_active,
      professionalIds: [],
    })
    setOpen(true)
    startTransition(async () => {
      const linked = await getServiceLinkedProfessionals(s.id)
      if (Array.isArray(linked)) form.setValue("professionalIds", linked)
    })
  }

  async function onSubmit(values: ServiceForm) {
    startTransition(async () => {
      const res = await upsertService(values)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Serviço atualizado" : "Serviço criado")
      setOpen(false)
      setEditing(null)
      try {
        const list = await getServices(salonId)
        setServices(list)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao recarregar serviços"
        toast.error(message)
      }
    })
  }

  async function onDelete(id: string) {
    startTransition(async () => {
      const res = await deleteService(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Serviço desativado")
      try {
        const list = await getServices(salonId)
        setServices(list)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao recarregar serviços"
        toast.error(message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <Toaster richColors />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scissors className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="bg-teal-600 text-white hover:bg-teal-700">
              <Plus className="size-4" />
              Novo Serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" {...form.register("name")} placeholder="Ex.: Corte Masculino" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" {...form.register("description")} placeholder="Opcional" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duração (min)</Label>
                  <Input id="duration" type="number" min={1} {...form.register("duration", { valueAsNumber: true })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input id="price" type="number" step="0.01" min={0} {...form.register("price", { valueAsNumber: true })} />
                </div>
                <div className="space-y-2">
                  <Controller
                    name="isActive"
                    control={form.control}
                    render={({ field }) => (
                      <Label className="flex items-center gap-2">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        Ativo
                      </Label>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Vincular à equipe</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {team.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 rounded-md border p-2">
                      <input
                        type="checkbox"
                        checked={(form.getValues("professionalIds") || []).includes(p.id)}
                        onChange={(e) => {
                          const prev = form.getValues("professionalIds") || []
                          const next = e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)
                          form.setValue("professionalIds", next)
                        }}
                      />
                      <span className="text-sm">{p.name}</span>
                      <span className="text-muted-foreground text-xs">{p.email}</span>
                    </label>
                  ))}
                </div>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Equipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{currency.format(Number(s.price))}</TableCell>
                <TableCell>{s.duration} min</TableCell>
                <TableCell>
                  {(() => {
                    const ids = links[s.id] || []
                    if (!ids.length) return <span className="text-muted-foreground text-xs">—</span>
                    const names = team.filter((p) => ids.includes(p.id)).map((p) => p.name)
                    return <span className="text-xs">{names.join(", ")}</span>
                  })()}
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
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

