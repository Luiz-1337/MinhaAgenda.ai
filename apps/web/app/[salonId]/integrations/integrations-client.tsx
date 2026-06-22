"use client"

import { useState, useTransition } from "react"
import { GoogleCalendarIntegration } from "@/components/dashboard/google-calendar-integration"
import { toast } from "sonner"
import {
  saveTrinksToken,
  deleteTrinksIntegration,
  syncTrinksData,
  syncTrinksCustomers,
  getTrinksIntegration,
  getTrinksProfilesStats,
} from "@/app/actions/integrations"
import type { ProfileDetails } from "@/app/actions/profile"

type TrinksStatus = { isActive: boolean; hasToken: boolean }
type TrinksStats = { count: number; lastSyncedAt: string | null }

interface IntegrationsClientProps {
  salonId: string
  initialProfile: ProfileDetails | null
  initialTrinksStatus: TrinksStatus | null
  initialTrinksStats: TrinksStats | null
}

export function IntegrationsClient({
  salonId,
  initialProfile,
  initialTrinksStatus,
  initialTrinksStats,
}: IntegrationsClientProps) {
  const [profileData] = useState<ProfileDetails | null>(initialProfile)
  const [trinksToken, setTrinksToken] = useState("")
  const [trinksIntegrationStatus, setTrinksIntegrationStatus] = useState<TrinksStatus | null>(initialTrinksStatus)
  const [isPendingTrinks, startTrinksTransition] = useTransition()
  const [trinksProfileStats, setTrinksProfileStats] = useState<TrinksStats | null>(initialTrinksStats)

  async function reloadTrinks() {
    if (!salonId) return
    const result = await getTrinksIntegration(salonId)
    if (!("error" in result)) {
      setTrinksIntegrationStatus(result.data || null)
    }
    const statsResult = await getTrinksProfilesStats(salonId)
    if (!("error" in statsResult)) {
      setTrinksProfileStats(statsResult.data || null)
    }
  }

  async function handleSyncTrinksCustomers() {
    if (!salonId) return

    startTrinksTransition(async () => {
      try {
        const result = await syncTrinksCustomers(salonId)
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        const enqueued = result.data?.enqueued ?? 0
        toast.success(`${enqueued} cliente(s) agendado(s) para sincronização`)
        await reloadTrinks()
      } catch (error) {
        console.error("Erro ao sincronizar clientes Trinks:", error)
        toast.error("Erro ao iniciar sincronização de clientes")
      }
    })
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
        await reloadTrinks()
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
        await reloadTrinks()
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
        toast.success(
          `Dados ${dataType === "professionals" ? "profissionais" : dataType === "services" ? "serviços" : "produtos"} sincronizados com sucesso`
        )
      } catch (error) {
        console.error(`Erro ao sincronizar ${dataType}:`, error)
        toast.error(`Erro ao sincronizar ${dataType}`)
      }
    })
  }

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0">
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Integrações</h2>
        <p className="text-xs text-muted-foreground">Conecte serviços externos ao seu salão.</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4">
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          {/* Google Calendar Integration */}
          {profileData ? <GoogleCalendarIntegration profile={profileData} /> : null}

          {/* Integração Trinks */}
          <div className="bg-card border border-border rounded-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-bold text-foreground">Integração Trinks</h3>
                <p className="text-xs text-muted-foreground mt-1">Sincronize agendamentos e dados com a plataforma Trinks</p>
              </div>
              {trinksIntegrationStatus?.isActive && (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Ativa
                </span>
              )}
            </div>

            <form onSubmit={handleSaveTrinksToken} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Token da API Trinks
                </label>
                <input
                  type="password"
                  placeholder="Cole aqui o token da API Trinks"
                  value={trinksToken}
                  onChange={(e) => setTrinksToken(e.target.value)}
                  className="w-full bg-card border border-border rounded-md px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Obtenha o token em:{" "}
                  <a
                    href="https://www.trinks.com/MinhaArea/MeuCadastro"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 underline"
                  >
                    Minha Área Trinks
                  </a>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isPendingTrinks || !trinksToken.trim()}
                  className="px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPendingTrinks ? "Salvando..." : trinksIntegrationStatus?.hasToken ? "Atualizar Token" : "Salvar Token"}
                </button>

                {trinksIntegrationStatus?.hasToken && (
                  <button
                    type="button"
                    onClick={handleDeleteTrinksIntegration}
                    disabled={isPendingTrinks}
                    className="px-5 py-2.5 bg-destructive text-destructive-foreground rounded-md text-xs font-bold hover:bg-destructive/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remover Integração
                  </button>
                )}
              </div>

              {trinksIntegrationStatus?.isActive && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-xs font-bold text-foreground mb-4">Sincronizar Dados</h4>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleSyncTrinksData("professionals")}
                      disabled={isPendingTrinks}
                      className="px-4 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sincronizar Profissionais
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSyncTrinksData("services")}
                      disabled={isPendingTrinks}
                      className="px-4 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sincronizar Serviços
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSyncTrinksData("products")}
                      disabled={isPendingTrinks}
                      className="px-4 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sincronizar Produtos
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncTrinksCustomers}
                      disabled={isPendingTrinks}
                      className="px-4 py-2 bg-accent/10 text-accent border border-accent/20 rounded-lg text-xs font-medium hover:bg-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sincronizar Clientes
                    </button>
                  </div>
                  {trinksProfileStats && (
                    <p className="text-xs text-muted-foreground mt-3">
                      {trinksProfileStats.count} cliente{trinksProfileStats.count === 1 ? "" : "s"} sincronizado{trinksProfileStats.count === 1 ? "" : "s"}
                      {trinksProfileStats.lastSyncedAt
                        ? ` · última atualização em ${new Date(trinksProfileStats.lastSyncedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                        : ""}
                    </p>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
