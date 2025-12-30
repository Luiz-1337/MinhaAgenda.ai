"use client"

import { useState, useEffect, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SalonEditForm } from "@/components/dashboard/salon-edit-form"
import { ProfileEditForm } from "@/components/dashboard/profile-edit-form"
import { getCurrentSalon } from "@/app/actions/salon"
import { getCurrentProfile } from "@/app/actions/profile"
import { useSalon } from "@/contexts/salon-context"
import { toast } from "sonner"
import { User, Store, Shield, Save, ChevronRight } from "lucide-react"
import type { SalonDetails } from "@/app/actions/salon"
import type { ProfileDetails } from "@/app/actions/profile"

type TabType = "profile" | "salon" | "security"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("profile")
  const { activeSalon } = useSalon()
  const [salonData, setSalonData] = useState<SalonDetails | null>(null)
  const [isLoadingSalon, setIsLoadingSalon] = useState(false)
  const [lastLoadedSalonId, setLastLoadedSalonId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileDetails | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" })
  const [isPendingPassword, startPasswordTransition] = useTransition()

  const navItems: { id: TabType; label: string; icon: React.ReactNode; description: string }[] = [
    { id: "profile", label: "Meu Perfil", icon: <User size={18} />, description: "Informações pessoais e avatar" },
    { id: "salon", label: "Meu Salão", icon: <Store size={18} />, description: "Dados do estabelecimento e regras" },
    { id: "security", label: "Segurança", icon: <Shield size={18} />, description: "Senha e sessões ativas" },
  ]

  // Função para carregar dados do salão
  const loadSalonData = async (salonId: string) => {
    if (lastLoadedSalonId === salonId && salonData?.id === salonId) {
      return // Já temos os dados corretos
    }
    
    setIsLoadingSalon(true)
    setSalonData(null)
    
    try {
      const result = await getCurrentSalon(salonId)
      if ("error" in result) {
        console.error("Erro ao carregar salão:", result.error)
        setSalonData(null)
        setLastLoadedSalonId(null)
      } else {
        setSalonData(result)
        setLastLoadedSalonId(salonId)
      }
    } catch (error) {
      console.error("Erro ao carregar salão:", error)
      setSalonData(null)
      setLastLoadedSalonId(null)
    } finally {
      setIsLoadingSalon(false)
    }
  }

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

  // Carrega os dados do perfil quando a aba "profile" é selecionada
  useEffect(() => {
    if (activeTab === "profile") {
      loadProfileData()
    }
  }, [activeTab])

  // Carrega os dados do salão quando a aba "salon" é selecionada ou quando o salão ativo muda
  useEffect(() => {
    if (activeTab === "salon" && activeSalon) {
      loadSalonData(activeSalon.id)
    } else if (activeTab !== "salon") {
      // Limpa os dados quando sair da aba
      setSalonData(null)
      setLastLoadedSalonId(null)
    }
  }, [activeTab, activeSalon?.id])

  // Limpa os campos de senha quando sair da aba
  useEffect(() => {
    if (activeTab !== "security") {
      setPasswordData({ current: "", new: "", confirm: "" })
    }
  }, [activeTab])

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
        // TODO: Implementar chamada à API para alterar senha
        // const result = await changePassword(passwordData.current, passwordData.new)
        toast.success("Senha alterada com sucesso")
        setPasswordData({ current: "", new: "", confirm: "" })
      } catch (error) {
        toast.error("Erro ao alterar senha. Verifique a senha atual.")
      }
    })
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* Header Compacto */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Configurações</h2>
          <p className="text-xs text-slate-500">Personalize seu ambiente de IA.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
          <Save size={16} />
          Salvar Alterações
        </button>
      </div>

      {/* Main Container - Two Columns */}
      <div className="flex-1 flex gap-8 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <nav className="w-64 flex-shrink-0 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl transition-all text-left group ${
                activeTab === item.id
                  ? "bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-sm"
                  : "hover:bg-slate-100 dark:hover:bg-white/5 opacity-60 hover:opacity-100"
              }`}
            >
              <div className={`mt-1 p-2 rounded-xl transition-colors ${
                activeTab === item.id ? "bg-indigo-600 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-500"
              }`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${activeTab === item.id ? "text-slate-800 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                  {item.label}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{item.description}</p>
              </div>
              {activeTab === item.id && <ChevronRight size={14} className="mt-1.5 text-indigo-500" />}
            </button>
          ))}
        </nav>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
          <div className="max-w-3xl">
        {activeTab === "profile" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
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
              <ProfileEditForm profile={profileData} />
            ) : (
              <div className="py-8 text-center text-slate-400">Erro ao carregar dados do perfil.</div>
            )}
          </div>
        )}

        {activeTab === "salon" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            {isLoadingSalon ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-20 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-40" />
                  <div className="space-y-3">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 rounded-md border p-3">
                        <Skeleton className="h-6 w-11 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-4 w-8" />
                        <Skeleton className="h-10 flex-1" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-28" />
                  <div className="space-y-4 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-10 w-full" />
              </div>
            ) : salonData && activeSalon ? (
              <SalonEditForm salon={salonData} salonId={activeSalon.id} />
            ) : (
              <div className="py-8 text-center text-slate-400">
                Nenhum salão selecionado. Selecione um salão no menu superior.
              </div>
            )}
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-6">Alterar Senha</h3>

              <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Senha Atual
                  </label>
                  <input
                    type="password"
                    placeholder="Digite sua senha atual"
                    value={passwordData.current}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, current: e.target.value }))}
                    required
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
                    required
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
                    required
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
        )}
          </div>
        </div>
      </div>
    </div>
  )
}

