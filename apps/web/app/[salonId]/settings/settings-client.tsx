"use client"

import { useState, useRef } from "react"
import { ProfileEditForm, type ProfileEditFormRef } from "@/components/dashboard/profile-edit-form"
import { Store, Save, ArrowRight } from "lucide-react"
import type { ProfileDetails } from "@/app/actions/profile"
import Link from "next/link"

export function SettingsClient({
  profile,
  salonId,
}: {
  profile: ProfileDetails
  salonId: string
}) {
  const [isPending, setIsPending] = useState(false)
  const profileFormRef = useRef<ProfileEditFormRef>(null)

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Meu Perfil</h2>
          <p className="text-xs text-muted-foreground">Informações pessoais e segurança.</p>
        </div>
        <button
          onClick={() => profileFormRef.current?.submit()}
          disabled={isPending}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          <span className="hidden sm:inline">{isPending ? "Salvando..." : "Salvar Alterações"}</span>
          <span className="sm:hidden">{isPending ? "..." : "Salvar"}</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4">
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          {/* Link para Configurações do Salão */}
          {salonId && (
            <Link
              href={`/${salonId}/salon-settings`}
              className="block bg-card border border-border rounded-md p-6 hover:border-accent/30 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
                    <Store size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Configurações do Salão</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Gerencie dados do estabelecimento e regras</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
            </Link>
          )}

          <ProfileEditForm
            ref={profileFormRef}
            profile={profile}
            onPendingChange={setIsPending}
          />
        </div>
      </div>
    </div>
  )
}
