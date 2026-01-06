"use client"

import { useTransition, forwardRef, useImperativeHandle, useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateProfile } from "@/app/actions/profile"
import { updateProfileSchema, type UpdateProfileSchema } from "@/lib/schemas"
import { toast } from "sonner"
import { User, Mail, Phone, Camera, Shield } from "lucide-react"
import type { ProfileDetails } from "@/app/actions/profile"
import { createBrowserClient } from "@supabase/ssr"

export interface ProfileEditFormRef {
  submit: () => void
}

interface ProfileEditFormProps {
  profile: ProfileDetails
  onPendingChange?: (isPending: boolean) => void
}

export const ProfileEditForm = forwardRef<ProfileEditFormRef, ProfileEditFormProps>(
  ({ profile, onPendingChange }, ref) => {
    const [isPending, startTransition] = useTransition()
    const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" })
    const [isPendingPassword, startPasswordTransition] = useTransition()

    // Notifica o componente pai sobre mudanças no estado isPending
    useEffect(() => {
      onPendingChange?.(isPending || isPendingPassword)
    }, [isPending, isPendingPassword, onPendingChange])

    const form = useForm<Omit<UpdateProfileSchema, "calendarSyncEnabled">>({
      resolver: zodResolver(updateProfileSchema.omit({ calendarSyncEnabled: true })),
      defaultValues: {
        fullName: profile.fullName || "",
        phone: profile.phone || "",
      },
      mode: "onChange",
    })

    function onSubmit(values: Omit<UpdateProfileSchema, "calendarSyncEnabled">) {
      startTransition(async () => {
        const res = await updateProfile({
          fullName: values.fullName?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
        })

        if ("error" in res) {
          toast.error(res.error)
          return
        }

        toast.success("Perfil atualizado com sucesso")
        window.location.reload()
      })
    }

    async function handleChangePassword(e: React.FormEvent) {
      e.preventDefault()
      
      if (!passwordData.current || !passwordData.new || !passwordData.confirm) {
        toast.error("Preencha todos os campos")
        return
      }

      if (passwordData.new !== passwordData.confirm) {
        toast.error("As senhas não coincidem")
        return
      }

      if (passwordData.new.length < 6) {
        toast.error("A nova senha deve ter pelo menos 6 caracteres")
        return
      }

      startPasswordTransition(async () => {
        try {
          const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          )

          // Obtém o usuário atual para pegar o email
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          
          if (userError || !user || !user.email) {
            toast.error("Erro ao obter informações do usuário")
            return
          }

          // Verifica a senha atual tentando fazer login
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: passwordData.current,
          })

          if (signInError) {
            toast.error("Senha atual incorreta")
            return
          }

          // Se a senha atual estiver correta, atualiza para a nova senha
          const { error: updateError } = await supabase.auth.updateUser({
            password: passwordData.new,
          })

          if (updateError) {
            toast.error("Erro ao alterar senha. Tente novamente.")
            return
          }

          toast.success("Senha alterada com sucesso")
          setPasswordData({ current: "", new: "", confirm: "" })
        } catch (error) {
          console.error("Erro ao alterar senha:", error)
          toast.error("Erro ao alterar senha. Verifique a senha atual.")
        }
      })
    }

    // Expõe métodos para o componente pai
    useImperativeHandle(ref, () => ({
      submit: () => {
        form.handleSubmit(onSubmit)()
      },
    }))

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
      </form>

      {/* Security Card - Fora do formulário principal para evitar form aninhado */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
          <Shield size={16} className="text-indigo-500" />
          Segurança
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Senha Atual
            </label>
            <input
              type="password"
              placeholder="Digite sua senha atual"
              value={passwordData.current}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, current: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nova Senha</label>
            <input
              type="password"
              placeholder="Digite sua nova senha"
              value={passwordData.new}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, new: e.target.value }))}
              minLength={6}
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              placeholder="Confirme sua nova senha"
              value={passwordData.confirm}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, confirm: e.target.value }))}
              minLength={6}
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isPendingPassword}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPendingPassword ? "Alterando..." : "Atualizar Senha"}
          </button>
        </form>
      </div>
    </div>
  )
})

ProfileEditForm.displayName = "ProfileEditForm"

