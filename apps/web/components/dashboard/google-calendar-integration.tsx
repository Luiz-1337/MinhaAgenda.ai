"use client"

import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Calendar, Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateProfile } from "@/app/actions/profile"
import { updateProfileSchema, type UpdateProfileSchema } from "@/lib/schemas"
import { useTransition } from "react"
import type { ProfileDetails } from "@/app/actions/profile"

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
      className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
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

  const form = useForm<Pick<UpdateProfileSchema, "calendarSyncEnabled">>({
    resolver: zodResolver(updateProfileSchema.pick({ calendarSyncEnabled: true })),
    defaultValues: {
      calendarSyncEnabled: profile.calendarSyncEnabled,
    },
    mode: "onChange",
  })

  function handleToggleChange(checked: boolean) {
    form.setValue("calendarSyncEnabled", checked)
    startTransition(async () => {
      const res = await updateProfile({
        calendarSyncEnabled: checked,
      })

      if ("error" in res) {
        toast.error(res.error)
        form.setValue("calendarSyncEnabled", !checked)
        return
      }

      toast.success("Configuração do Google Calendar atualizada")
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Calendar size={16} className="text-blue-500" />
            Google Calendar
          </h3>
          <p className="text-xs text-slate-500 mt-1">Sincronize seus agendamentos com o Google Calendar</p>
        </div>
        {form.watch("calendarSyncEnabled") && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
            Ativa
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Calendar size={16} />
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sincronização Automática</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="calendarSyncEnabled"
              checked={form.watch("calendarSyncEnabled")}
              onCheckedChange={handleToggleChange}
              disabled={isPending}
            />
            {form.watch("calendarSyncEnabled") && (
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                <Check size={10} /> Conectado
              </span>
            )}
          </div>
        </div>

        <GoogleCalendarConnectButton isConnected={!!form.watch("calendarSyncEnabled")} />
      </div>
    </div>
  )
}

