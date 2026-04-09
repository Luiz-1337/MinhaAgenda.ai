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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(updateProfileSchema.omit({ calendarSyncEnabled: true }) as any),
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
        <div className="bg-card border border-border rounded-md p-6">
          <div className="flex items-center gap-6 mb-8 pb-6 border-b border-border">
            <div className="relative group">
              <div className="w-20 h-20 rounded-md bg-primary p-0.5">
                <div className="w-full h-full rounded-[14px] bg-muted flex items-center justify-center overflow-hidden">
                  <span className="text-xl font-bold text-muted-foreground">
                    {getInitials(profile.fullName)}
                  </span>
                </div>
              </div>
              <button type="button" className="absolute -bottom-2 -right-2 p-2 bg-card border border-border rounded-md text-muted-foreground hover:text-accent transition-all">
                <Camera size={14} />
              </button>
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{profile.fullName || "Usuário"}</h3>
              <p className="text-xs text-muted-foreground">{profile.systemRole === "admin" ? "Administrador da conta" : "Usuário"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5 w-full">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome Completo</label>
              <div className="relative group">
                <div className="absolute left-3 top-2.5 text-muted-foreground group-focus-within:text-accent transition-colors">
                  <User size={14} />
                </div>
                <input
                  type="text"
                  {...form.register("fullName")}
                  placeholder="Seu nome completo"
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-ring transition-all"
                />
              </div>
              {form.formState.errors.fullName && (
                <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5 w-full">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail Corporativo</label>
              <div className="relative group">
                <div className="absolute left-3 top-2.5 text-muted-foreground">
                  <Mail size={14} />
                </div>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full bg-muted border border-border rounded-md pl-10 pr-4 py-2 text-sm text-muted-foreground cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5 w-full">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefone</label>
              <div className="relative group">
                <div className="absolute left-3 top-2.5 text-muted-foreground group-focus-within:text-accent transition-colors">
                  <Phone size={14} />
                </div>
                <input
                  type="text"
                  {...form.register("phone")}
                  placeholder="(11) 90000-0000"
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-ring transition-all"
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.phone.message}</p>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Security Card - Fora do formulário principal para evitar form aninhado */}
      <div className="bg-card border border-border rounded-md p-6">
        <h3 className="text-sm font-bold text-foreground mb-6 flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          Segurança
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Senha Atual
            </label>
            <input
              type="password"
              placeholder="Digite sua senha atual"
              value={passwordData.current}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, current: e.target.value }))}
              className="w-full bg-background border border-border rounded-md px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nova Senha</label>
            <input
              type="password"
              placeholder="Digite sua nova senha"
              value={passwordData.new}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, new: e.target.value }))}
              minLength={6}
              className="w-full bg-background border border-border rounded-md px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              placeholder="Confirme sua nova senha"
              value={passwordData.confirm}
              onChange={(e) => setPasswordData((prev) => ({ ...prev, confirm: e.target.value }))}
              minLength={6}
              className="w-full bg-background border border-border rounded-md px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isPendingPassword}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPendingPassword ? "Alterando..." : "Atualizar Senha"}
          </button>
        </form>
      </div>
    </div>
  )
})

ProfileEditForm.displayName = "ProfileEditForm"

