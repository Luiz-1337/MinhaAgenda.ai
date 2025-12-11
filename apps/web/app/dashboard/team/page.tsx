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
import { Pencil, Trash2, Users, Clock } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getProfessionals, upsertProfessional, deleteProfessional, type ProfessionalRow } from "@/app/actions/professionals"
import { useSalon } from "@/contexts/salon-context"
import AvailabilitySheet from "@/components/team/availability-sheet"

// Função para formatar os dias da semana
function formatWorkingDays(days?: number[]): string {
  if (!days || days.length === 0) {
    return "—"
  }

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  return days.map((day) => dayNames[day]).join(", ")
}

const professionalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})
type ProfessionalForm = z.infer<typeof professionalSchema>

export default function TeamPage() {
  const { activeSalon } = useSalon()
  const [tab, setTab] = useState("todos")
  const [list, setList] = useState<ProfessionalRow[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProfessionalRow | null>(null)
  const [isPending, startTransition] = useTransition()
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<ProfessionalForm>({
    resolver: zodResolver(professionalSchema) as any,
    defaultValues: { name: "", email: "", phone: "", isActive: true },
  })

  useEffect(() => {
    if (!activeSalon) return
    
    setIsLoading(true)
    startTransition(async () => {
      const res = await getProfessionals(activeSalon.id)
      if (Array.isArray(res)) {
        setList(res)
      } else {
        toast.error(res.error)
      }
      setIsLoading(false)
    })
  }, [activeSalon?.id])

  const filtered = useMemo(() => {
    if (tab === "ativos") return list.filter((p) => p.is_active)
    if (tab === "inativos") return list.filter((p) => !p.is_active)
    return list
  }, [list, tab])

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", email: "", phone: "", isActive: true })
    setOpen(true)
  }

  function openEdit(p: ProfessionalRow) {
    setEditing(p)
    form.reset({ id: p.id, name: p.name, email: p.email, phone: p.phone || "", isActive: p.is_active })
    setOpen(true)
  }

  async function onSubmit(values: ProfessionalForm) {
    if (!activeSalon) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await upsertProfessional({ ...values, salonId: activeSalon.id })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Profissional atualizado" : "Profissional criado")
      setOpen(false)
      setEditing(null)
      const again = await getProfessionals(activeSalon.id)
      if (Array.isArray(again)) setList(again)
    })
  }

  async function onDelete(id: string) {
    if (!activeSalon) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await deleteProfessional(id, activeSalon.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Profissional desativado")
      const again = await getProfessionals(activeSalon.id)
      if (Array.isArray(again)) setList(again)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="bg-teal-600 text-white hover:bg-teal-700">Convidar membro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" {...form.register("name")} placeholder="Ex.: Ana Souza" />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" {...form.register("email")} placeholder="ana@empresa.com" />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" {...form.register("phone")} placeholder="(11) 9XXXX-XXXX" />
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{editing ? "Salvar" : "Criar"}</Button>
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
                      <Skeleton className="h-10 w-48" />
                    </div>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Dias de Trabalho</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum profissional encontrado. Clique em "Convidar membro" para começar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.email}</TableCell>
                          <TableCell>{p.phone || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatWorkingDays(p.working_days)}
                          </TableCell>
                          <TableCell>
                            {p.is_active ? (
                              <span className="bg-green-100 text-green-700 border-green-200 inline-flex rounded-md border px-2 py-1 text-xs">Ativo</span>
                            ) : (
                              <span className="bg-muted text-foreground/70 border-muted-foreground/20 inline-flex rounded-md border px-2 py-1 text-xs">Inativo</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                                <Pencil className="size-4" />
                                Editar
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setSelectedProfessional(p); setAvailabilityOpen(true) }}>
                                <Clock className="size-4" />
                                Horários
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => onDelete(p.id)}>
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
      {selectedProfessional && (
        <AvailabilitySheet
          open={availabilityOpen}
          onOpenChange={(v) => {
            setAvailabilityOpen(v)
            if (!v) setSelectedProfessional(null)
          }}
          professional={{ id: selectedProfessional.id, name: selectedProfessional.name }}
        />
      )}
      {selectedProfessional && (
        null
      )}
    </div>
  )
}
