"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateProfile } from "@/app/actions/profile"
import { updateProfileSchema, type UpdateProfileSchema } from "@/lib/schemas"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { User, Mail, Phone, Camera, Globe, Calendar, Check } from "lucide-react"
import type { ProfileDetails } from "@/app/actions/profile"
import { useParams } from "next/navigation"

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

  // Helper para obter iniciais
  const getInitials = (name: string | null | undefined): string => {
    if (!name) return "U"
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Avatar & Basic Info Card */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-6 mb-8 pb-6 border-b border-slate-100 dark:border-white/5">
            <div className="relative group">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-0.5 shadow-lg shadow-indigo-500/20">
                <div className="w-full h-full rounded-[14px] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                  <span className="text-xl font-bold text-slate-400">
                    {getInitials(profile.fullName)}
                  </span>
                </div>
              </div>
              <button type="button" className="absolute -bottom-2 -right-2 p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg text-slate-500 hover:text-indigo-500 transition-all">
                <Camera size={14} />
              </button>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{profile.fullName || "Usuário"}</h3>
              <p className="text-xs text-slate-500">{profile.systemRole === "admin" ? "Administrador da conta" : "Usuário"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Nome Completo</label>
              <div className="relative group">
                <div className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                  <User size={14} />
                </div>
                <input
                  type="text"
                  {...form.register("fullName")}
                  placeholder="Seu nome completo"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
              {form.formState.errors.fullName && (
                <p className="text-xs text-red-500">{form.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">E-mail Corporativo</label>
              <div className="relative group">
                <div className="absolute left-3 top-2.5 text-slate-400">
                  <Mail size={14} />
                </div>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Telefone</label>
              <div className="relative group">
                <div className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                  <Phone size={14} />
                </div>
                <input
                  type="text"
                  {...form.register("phone")}
                  placeholder="(11) 90000-0000"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-xs text-red-500">{form.formState.errors.phone.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Integrations Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Globe size={16} className="text-indigo-500" /> Integrações Ativas
          </h3>
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center"><Calendar size={16} /></div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Google Calendar</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="calendarSyncEnabled" {...form.register("calendarSyncEnabled")} />
              {form.watch("calendarSyncEnabled") && (
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                  <Check size={10} /> Conectado
                </span>
              )}
            </div>
          </div>
          <div className="mt-3">
            <GoogleCalendarConnectButton isConnected={!!form.watch("calendarSyncEnabled")} />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>
    </div>
  )
}

