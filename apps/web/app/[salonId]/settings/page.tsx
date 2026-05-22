"use client"

import { useState, useEffect, useRef } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { ProfileEditForm, type ProfileEditFormRef } from "@/components/dashboard/profile-edit-form"
import { getCurrentProfile } from "@/app/actions/profile"
import { Store, Save, ArrowRight } from "lucide-react"
import type { ProfileDetails } from "@/app/actions/profile"
import Link from "next/link"
import { useParams } from "next/navigation"

export default function SettingsPage() {
  const params = useParams()
  const salonId = params?.salonId as string | undefined
  const [profileData, setProfileData] = useState<ProfileDetails | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const profileFormRef = useRef<ProfileEditFormRef>(null)

  useEffect(() => {
    async function loadProfileData() {
      setIsLoadingProfile(true)
      try {
        const result = await getCurrentProfile()
        if ("error" in result) {
          console.error("Erro ao carregar perfil:", result.error)
          setProfileData(null)
        } else {
          setProfileData(result)
        }
      } catch (error) {
        console.error("Erro ao carregar perfil:", error)
        setProfileData(null)
      } finally {
        setIsLoadingProfile(false)
      }
    }
    loadProfileData()
  }, [])

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

          {isLoadingProfile ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
          ) : profileData ? (
            <ProfileEditForm
              ref={profileFormRef}
              profile={profileData}
              onPendingChange={setIsPending}
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground">Erro ao carregar dados do perfil.</div>
          )}
        </div>
      </div>
    </div>
  )
}
