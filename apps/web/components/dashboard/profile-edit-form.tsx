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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Avatar & Basic Info Card */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6 flex flex-col md:flex-row gap-8 items-start">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group cursor-pointer">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 p-1">
                <div className="w-full h-full rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                  <span className="text-2xl font-bold text-slate-500 dark:text-slate-400">
                    {getInitials(profile.fullName)}
                  </span>
                </div>
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white" size={24} />
              </div>
            </div>
            <button type="button" className="text-xs text-indigo-500 font-medium hover:underline">
              Alterar foto
            </button>
          </div>

          {/* Form Section */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Nome Completo
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  {...form.register("fullName")}
                  placeholder="Seu nome completo"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
              {form.formState.errors.fullName && (
                <p className="text-xs text-red-500">{form.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">E-mail</label>
              <div className="relative opacity-70 cursor-not-allowed">
                <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400">O e-mail não pode ser alterado.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Função</label>
              <input
                type="text"
                value={profile.systemRole === "admin" ? "Administrador" : "Usuário"}
                disabled
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Telefone Pessoal
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  {...form.register("phone")}
                  placeholder="(11) 90000-0000"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-xs text-red-500">{form.formState.errors.phone.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Integrations Card */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Globe size={16} className="text-indigo-500" /> Integrações
          </h3>

          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center p-2 shadow-sm">
                <Calendar className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Google Calendar</h4>
                <p className="text-xs text-slate-500">Sincronize agendamentos automaticamente.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="calendarSyncEnabled" {...form.register("calendarSyncEnabled")} />
              {form.watch("calendarSyncEnabled") && (
                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-bold flex items-center gap-1">
                  <Check size={12} /> Conectado
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>
    </div>
  )
}

