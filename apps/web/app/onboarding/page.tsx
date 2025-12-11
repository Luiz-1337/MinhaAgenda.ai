"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createSalon } from "@/app/actions/salon"
import { createSalonSchema, type CreateSalonSchema } from "@/lib/schemas"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Cadastrar Salão</CardTitle>
          <CardDescription>Informe os dados do seu salão</CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" {...form.register("name")} placeholder="Ex.: Barber Club" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">minhaagenda.ai/</span>
              <Input id="slug" {...form.register("slug")} placeholder="meu-salao" className="flex-1" />
            </div>
            {form.formState.errors.slug && (
              <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <textarea
              id="description"
              {...form.register("description")}
              placeholder="Descreva seu salão..."
              rows={3}
              className={cn(
                "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" {...form.register("address")} placeholder="Rua Exemplo, 123" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" {...form.register("phone")} placeholder="(11) 90000-0000" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" {...form.register("whatsapp")} placeholder="(11) 99999-9999" />
            {form.formState.errors.whatsapp && (
              <p className="text-sm text-destructive">{form.formState.errors.whatsapp.message}</p>
            )}
          </div>

          <div className="space-y-4">
            <Label>Horário de Funcionamento</Label>
            <div className="space-y-3">
              {DAYS_OF_WEEK.map((day) => {
                const workHours = form.watch("workHours") || {}
                const dayHours = workHours[day.value as keyof typeof workHours]
                const isActive = !!dayHours

                return (
                  <div key={day.value} className="flex items-center gap-4 rounded-md border p-3">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => {
                          const currentWorkHours = form.getValues("workHours") || {}
                          if (checked) {
                            form.setValue("workHours", {
                              ...currentWorkHours,
                              [day.value]: { start: "09:00", end: "18:00" },
                            })
                          } else {
                            const { [day.value]: _, ...rest } = currentWorkHours
                            form.setValue("workHours", Object.keys(rest).length > 0 ? rest : undefined)
                          }
                        }}
                      />
                      <Label className="font-normal">{day.label}</Label>
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="time"
                          {...form.register(`workHours.${day.value}.start`)}
                          className="flex-1"
                        />
                        <span className="text-muted-foreground">até</span>
                        <Input
                          type="time"
                          {...form.register(`workHours.${day.value}.end`)}
                          className="flex-1"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {form.formState.errors.workHours && (
              <p className="text-sm text-destructive">
                {form.formState.errors.workHours.message}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Label>Configurações</Label>
            <div className="space-y-4 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="accepts_card" className="font-normal">Aceita cartão</Label>
                  <p className="text-xs text-muted-foreground">O salão aceita pagamento com cartão</p>
                </div>
                <Switch
                  id="accepts_card"
                  {...form.register("settings.accepts_card")}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="parking" className="font-normal">Estacionamento</Label>
                  <p className="text-xs text-muted-foreground">O salão possui estacionamento</p>
                </div>
                <Switch
                  id="parking"
                  {...form.register("settings.parking")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="late_tolerance" className="font-normal">
                  Tolerância de atraso (minutos)
                </Label>
                <Input
                  id="late_tolerance"
                  type="number"
                  min="0"
                  {...form.register("settings.late_tolerance_minutes", { valueAsNumber: true })}
                  placeholder="10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancellation_policy" className="font-normal">
                  Política de cancelamento
                </Label>
                <textarea
                  id="cancellation_policy"
                  {...form.register("settings.cancellation_policy")}
                  placeholder="Ex.: Cancelamentos devem ser feitos com pelo menos 24h de antecedência"
                  rows={3}
                  className={cn(
                    "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Enviando..." : "Criar Salão"}
          </Button>
        </form>
      </Card>
    </div>
  )
}

