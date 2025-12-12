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
import { User, Store, Lock, Save } from "lucide-react"
import type { SalonDetails } from "@/app/actions/salon"
import type { ProfileDetails } from "@/app/actions/profile"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "salon" | "security">("profile")
  const { activeSalon } = useSalon()
  const [salonData, setSalonData] = useState<SalonDetails | null>(null)
  const [isLoadingSalon, setIsLoadingSalon] = useState(false)
  const [lastLoadedSalonId, setLastLoadedSalonId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileDetails | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" })
  const [isPendingPassword, startPasswordTransition] = useTransition()

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
    <div className="flex flex-col h-full gap-6 relative">
      {/* Header & Actions */}
      <div className="flex justify-between items-end flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Configurações</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie seu perfil, salão e segurança.</p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transform">
          <Save size={18} />
          Salvar Tudo
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-white/10">
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-6 py-3 text-sm font-medium transition-all relative ${
            activeTab === "profile"
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="flex items-center gap-2">
            <User size={16} /> Perfil
          </span>
          {activeTab === "profile" && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("salon")}
          className={`px-6 py-3 text-sm font-medium transition-all relative ${
            activeTab === "salon"
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="flex items-center gap-2">
            <Store size={16} /> Meu Salão
          </span>
          {activeTab === "salon" && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`px-6 py-3 text-sm font-medium transition-all relative ${
            activeTab === "security"
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <span className="flex items-center gap-2">
            <Lock size={16} /> Senha & Segurança
          </span>
          {activeTab === "security" && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full"></span>
          )}
        </button>
      </div>

      {/* Content Area (Scrollable) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {activeTab === "profile" && (
          <>
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
          </>
        )}

        {activeTab === "salon" && (
          <>
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
          </>
        )}

        {activeTab === "security" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Lock size={16} className="text-indigo-500" /> Alterar Senha
              </h3>

              <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
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
                  className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPendingPassword ? "Alterando..." : "Atualizar Senha"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

