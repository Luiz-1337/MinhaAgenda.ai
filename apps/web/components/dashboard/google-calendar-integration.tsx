"use client"

import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Calendar, Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateProfile } from "@/app/actions/profile"
import { updateProfileSchema, type UpdateProfileSchema } from "@/lib/schemas"
import { useTransition, useEffect, useState } from "react"
import type { ProfileDetails } from "@/app/actions/profile"
import { updateSalonIntegration } from "@/app/actions/integrations"

function GoogleCalendarConnectButton({ isConnected }: { isConnected: boolean }) {
  const params = useParams()
  const salonId = params?.salonId as string | undefined
  
  const handleConnect = () => {
    if (!salonId) {
      toast.error("Não foi possível identificar o salão. Tente novamente.")
      return
    }
    
    // Passa o salonId como query parameter
    window.location.href = `/api/google/auth?salonId=${salonId}`
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      className="w-full px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2"
    >
      <Calendar size={16} />
      {isConnected ? "Reconectar Google Calendar" : "Conectar Google Calendar"}
    </button>
  )
}

interface GoogleCalendarIntegrationProps {
  profile: ProfileDetails
}

export function GoogleCalendarIntegration({ profile }: GoogleCalendarIntegrationProps) {
  const [isPending, startTransition] = useTransition()
  const params = useParams()
  const salonId = params?.salonId as string | undefined
  const [integrationIsActive, setIntegrationIsActive] = useState<boolean | null>(null)

  // Busca integração do salão ao carregar
  useEffect(() => {
    async function fetchIntegration() {
      if (!salonId) return

      try {
        const response = await fetch(`/api/integrations/google?salonId=${salonId}`)
        if (response.ok) {
          const data = await response.json()
          setIntegrationIsActive(data.isActive ?? false)
        }
      } catch (error) {
        console.error("Erro ao buscar integração:", error)
      }
    }

    fetchIntegration()
  }, [salonId])

  // Usa isActive da integração se disponível, senão usa calendarSyncEnabled do profile
  const initialValue = integrationIsActive !== null ? integrationIsActive : profile.calendarSyncEnabled

  const form = useForm<Pick<UpdateProfileSchema, "calendarSyncEnabled">>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(updateProfileSchema.pick({ calendarSyncEnabled: true }) as any),
    defaultValues: {
      calendarSyncEnabled: initialValue,
    },
    mode: "onChange",
  })

  // Atualiza form quando integrationIsActive mudar
  useEffect(() => {
    if (integrationIsActive !== null) {
      form.setValue("calendarSyncEnabled", integrationIsActive)
    }
  }, [integrationIsActive, form])

  function handleToggleChange(checked: boolean) {
    form.setValue("calendarSyncEnabled", checked)
    startTransition(async () => {
      if (!salonId) {
        toast.error("Não foi possível identificar o salão. Tente novamente.")
        form.setValue("calendarSyncEnabled", !checked)
        return
      }

      // Atualiza isActive na integração do salão
      const integrationRes = await updateSalonIntegration(salonId, checked)

      if ("error" in integrationRes) {
        toast.error(integrationRes.error)
        form.setValue("calendarSyncEnabled", !checked)
        return
      }

      // Mantém compatibilidade: também atualiza calendarSyncEnabled no profile
      const profileRes = await updateProfile({
        calendarSyncEnabled: checked,
      })

      if ("error" in profileRes) {
        // Se falhar no profile, não reverte a integração (já foi atualizada)
        console.warn("Erro ao atualizar profile, mas integração foi atualizada:", profileRes.error)
      }

      setIntegrationIsActive(checked)
      toast.success("Configuração do Google Calendar atualizada")
    })
  }

  return (
    <div className="bg-card border border-border rounded-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
            Google Calendar
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Sincronize seus agendamentos com o Google Calendar</p>
        </div>
        {(integrationIsActive ?? form.watch("calendarSyncEnabled")) && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            Ativa
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-md bg-background border border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Calendar size={16} />
            </div>
            <span className="text-xs font-semibold text-foreground">Sincronização Automática</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="calendarSyncEnabled"
              checked={form.watch("calendarSyncEnabled")}
              onCheckedChange={handleToggleChange}
              disabled={isPending}
            />
            {form.watch("calendarSyncEnabled") && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                <Check size={10} /> Conectado
              </span>
            )}
          </div>
        </div>

        <GoogleCalendarConnectButton isConnected={!!(integrationIsActive ?? form.watch("calendarSyncEnabled"))} />
      </div>
    </div>
  )
}

