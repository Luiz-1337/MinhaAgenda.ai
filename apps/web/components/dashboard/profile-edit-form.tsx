"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateProfile } from "@/app/actions/profile"
import { updateProfileSchema, type UpdateProfileSchema } from "@/lib/schemas"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import type { ProfileDetails } from "@/app/actions/profile"

interface ProfileEditFormProps {
  profile: ProfileDetails
}

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<UpdateProfileSchema>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: profile.fullName || "",
      phone: profile.phone || "",
      calendarSyncEnabled: profile.calendarSyncEnabled,
    },
    mode: "onChange",
  })

  function onSubmit(values: UpdateProfileSchema) {
    startTransition(async () => {
      const res = await updateProfile({
        fullName: values.fullName?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        calendarSyncEnabled: values.calendarSyncEnabled,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success("Perfil atualizado com sucesso")
      window.location.reload()
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" value={profile.email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Nome Completo</Label>
        <Input id="fullName" {...form.register("fullName")} placeholder="Seu nome completo" />
        {form.formState.errors.fullName && (
          <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefone</Label>
        <Input id="phone" {...form.register("phone")} placeholder="(11) 90000-0000" />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="systemRole">Função no Sistema</Label>
        <Input 
          id="systemRole" 
          value={profile.systemRole === "admin" ? "Administrador" : "Usuário"} 
          disabled 
          className="bg-muted" 
        />
        <p className="text-xs text-muted-foreground">Função definida automaticamente</p>
      </div>

      {profile.userTier && (
        <div className="space-y-2">
          <Label htmlFor="userTier">Plano</Label>
          <Input 
            id="userTier" 
            value={
              profile.userTier === "standard" ? "Padrão" :
              profile.userTier === "advanced" ? "Avançado" :
              profile.userTier === "professional" ? "Profissional" : profile.userTier
            } 
            disabled 
            className="bg-muted" 
          />
          <p className="text-xs text-muted-foreground">Plano atual do usuário</p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="calendarSyncEnabled" className="font-normal">
            Sincronização com Google Calendar
          </Label>
          <p className="text-xs text-muted-foreground">
            Sincronizar agendamentos automaticamente com o Google Calendar
          </p>
        </div>
        <Switch
          id="calendarSyncEnabled"
          {...form.register("calendarSyncEnabled")}
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Salvando..." : "Salvar Alterações"}
      </Button>
    </form>
  )
}

