"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { ProfileEditForm, type ProfileEditFormRef } from "@/components/dashboard/profile-edit-form"
import { GoogleCalendarIntegration } from "@/components/dashboard/google-calendar-integration"
import { getCurrentProfile } from "@/app/actions/profile"
import { toast } from "sonner"
import { saveTrinksToken, getTrinksIntegration, deleteTrinksIntegration, syncTrinksData } from "@/app/actions/integrations"
import { User, Store, Save, ChevronRight, ArrowRight, Plug } from "lucide-react"
import type { ProfileDetails } from "@/app/actions/profile"
import Link from "next/link"
import { useParams } from "next/navigation"

type TabType = "profile" | "integrations"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("profile")
  const params = useParams()
  const salonId = params?.salonId as string | undefined
  const [profileData, setProfileData] = useState<ProfileDetails | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [trinksToken, setTrinksToken] = useState("")
  const [trinksIntegrationStatus, setTrinksIntegrationStatus] = useState<{ isActive: boolean; hasToken: boolean } | null>(null)
  const [isLoadingTrinks, setIsLoadingTrinks] = useState(false)
  const [isPendingTrinks, startTrinksTransition] = useTransition()
  const profileFormRef = useRef<ProfileEditFormRef>(null)

  const navItems: { id: TabType; label: string; icon: React.ReactNode; description: string }[] = [
    { id: "profile", label: "Meu Perfil", icon: <User size={18} />, description: "Informações pessoais e segurança" },
    { id: "integrations", label: "Integrações", icon: <Plug size={18} />, description: "Conectar serviços externos" },
  ]

  // Função para carregar dados do perfil
  const loadProfileData = async () => {
    if (profileData) {
      return // Já temos os dados
    }
    
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

  // Carrega os dados do perfil quando necessário
  useEffect(() => {
    if (activeTab === "profile" || activeTab === "integrations") {
      if (!profileData) {
        loadProfileData()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Carrega status da integração Trinks quando a aba "integrations" é selecionada
  useEffect(() => {
    if (activeTab === "integrations" && salonId) {
      loadTrinksIntegration()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, salonId])

  async function loadTrinksIntegration() {
    if (!salonId) return
    setIsLoadingTrinks(true)
    try {
      const result = await getTrinksIntegration(salonId)
      if ("error" in result) {
        console.error("Erro ao carregar integração Trinks:", result.error)
        setTrinksIntegrationStatus(null)
      } else {
        setTrinksIntegrationStatus(result.data || null)
      }
    } catch (error) {
      console.error("Erro ao carregar integração Trinks:", error)
      setTrinksIntegrationStatus(null)
    } finally {
      setIsLoadingTrinks(false)
    }
  }

  async function handleSaveTrinksToken(e: React.FormEvent) {
    e.preventDefault()
    if (!salonId || !trinksToken.trim()) {
      toast.error("Token é obrigatório")
      return
    }

    startTrinksTransition(async () => {
      try {
        const result = await saveTrinksToken(salonId, trinksToken.trim())
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        toast.success("Token salvo com sucesso")
        setTrinksToken("")
        await loadTrinksIntegration()
      } catch (error) {
        console.error("Erro ao salvar token Trinks:", error)
        toast.error("Erro ao salvar token")
      }
    })
  }

  async function handleDeleteTrinksIntegration() {
    if (!salonId) return

    if (!confirm("Tem certeza que deseja remover a integração Trinks?")) {
      return
    }

    startTrinksTransition(async () => {
      try {
        const result = await deleteTrinksIntegration(salonId)
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        toast.success("Integração removida com sucesso")
        setTrinksToken("")
        await loadTrinksIntegration()
      } catch (error) {
        console.error("Erro ao remover integração Trinks:", error)
        toast.error("Erro ao remover integração")
      }
    })
  }

  async function handleSyncTrinksData(dataType: "professionals" | "services" | "products") {
    if (!salonId) return

    startTrinksTransition(async () => {
      try {
        const result = await syncTrinksData(salonId, dataType)
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        toast.success(`Dados ${dataType === "professionals" ? "profissionais" : dataType === "services" ? "serviços" : "produtos"} sincronizados com sucesso`)
      } catch (error) {
        console.error(`Erro ao sincronizar ${dataType}:`, error)
        toast.error(`Erro ao sincronizar ${dataType}`)
      }
    })
  }


  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 overflow-hidden">
      {/* Header Compacto */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 flex-shrink-0">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white tracking-tight">Configurações</h2>
          <p className="text-xs text-slate-500">Personalize seu ambiente de IA.</p>
        </div>
        {activeTab === "profile" && (
          <button
            onClick={() => profileFormRef.current?.submit()}
            disabled={isPending}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            <span className="hidden sm:inline">{isPending ? "Salvando..." : "Salvar Alterações"}</span>
            <span className="sm:hidden">{isPending ? "..." : "Salvar"}</span>
          </button>
        )}
      </div>

      {/* Main Container - Two Columns (responsive) */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-8 overflow-hidden">
        {/* Navigation - Horizontal tabs on mobile, vertical sidebar on desktop */}
        <nav className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-visible md:w-64 flex-shrink-0 pb-2 md:pb-0 -mx-2 px-2 md:mx-0 md:px-0">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-shrink-0 md:flex-shrink flex items-center md:items-start gap-2 md:gap-4 px-3 md:px-4 py-2.5 md:py-4 rounded-xl md:rounded-2xl transition-all text-left group whitespace-nowrap ${
                activeTab === item.id
                  ? "bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-sm"
                  : "hover:bg-slate-100 dark:hover:bg-white/5 opacity-60 hover:opacity-100"
              }`}
            >
              <div className={`p-1.5 md:p-2 md:mt-1 rounded-lg md:rounded-xl transition-colors ${
                activeTab === item.id ? "bg-indigo-600 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-500"
              }`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs md:text-sm font-bold ${activeTab === item.id ? "text-slate-800 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                  {item.label}
                </p>
                <p className="text-[10px] text-slate-400 truncate hidden md:block">{item.description}</p>
              </div>
              {activeTab === item.id && <ChevronRight size={14} className="mt-0.5 md:mt-1.5 text-indigo-500 hidden md:block" />}
            </button>
          ))}
        </nav>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4">
          <div className="max-w-3xl">
        {activeTab === "profile" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
            {/* Link para Configurações do Salão */}
            {salonId && (
              <Link
                href={`/${salonId}/salon-settings`}
                className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500/20 transition-colors">
                      <Store size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-white">Configurações do Salão</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Gerencie dados do estabelecimento e regras</p>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
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
              <div className="py-8 text-center text-slate-400">Erro ao carregar dados do perfil.</div>
            )}
          </div>
        )}

        {activeTab === "integrations" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Google Calendar Integration */}
            {isLoadingProfile ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
                <div className="space-y-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            ) : profileData ? (
              <GoogleCalendarIntegration profile={profileData} />
            ) : null}

            {/* Integração Trinks */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Integração Trinks</h3>
                  <p className="text-xs text-slate-500 mt-1">Sincronize agendamentos e dados com a plataforma Trinks</p>
                </div>
                {trinksIntegrationStatus?.isActive && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
                    Ativa
                  </span>
                )}
              </div>

              {isLoadingTrinks ? (
                <div className="space-y-4">
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-xl" />
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-xl" />
                </div>
              ) : (
                <form onSubmit={handleSaveTrinksToken} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Token da API Trinks
                    </label>
                    <input
                      type="password"
                      placeholder="Cole aqui o token da API Trinks"
                      value={trinksToken}
                      onChange={(e) => setTrinksToken(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                    />
                    <p className="text-xs text-slate-400">
                      Obtenha o token em:{" "}
                      <a
                        href="https://www.trinks.com/MinhaArea/MeuCadastro"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500 hover:text-indigo-600 underline"
                      >
                        Minha Área Trinks
                      </a>
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isPendingTrinks || !trinksToken.trim()}
                      className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPendingTrinks ? "Salvando..." : trinksIntegrationStatus?.hasToken ? "Atualizar Token" : "Salvar Token"}
                    </button>

                    {trinksIntegrationStatus?.hasToken && (
                      <button
                        type="button"
                        onClick={handleDeleteTrinksIntegration}
                        disabled={isPendingTrinks}
                        className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Remover Integração
                      </button>
                    )}
                  </div>

                  {trinksIntegrationStatus?.isActive && (
                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/5">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-4">Sincronizar Dados</h4>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleSyncTrinksData("professionals")}
                          disabled={isPendingTrinks}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Sincronizar Profissionais
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSyncTrinksData("services")}
                          disabled={isPendingTrinks}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Sincronizar Serviços
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSyncTrinksData("products")}
                          disabled={isPendingTrinks}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Sincronizar Produtos
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  )
}

