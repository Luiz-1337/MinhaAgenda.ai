"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { ExternalLink, Eye, EyeOff, Link2, Loader2, RefreshCw } from "lucide-react"
import type { AgendaCatalogItem, AgendaLinkingData, AgendaLinkRow, AgendaSetupStatus } from "@repo/db"
import {
  connectBelasis,
  disconnectBelasis,
  getBelasisLinking,
  getBelasisStatus,
  getBelasisSyncStatus,
  saveBelasisLinks,
  setBelasisActive,
  startBelasisSync,
} from "@/app/actions/belasis"
import { BELASIS_LINKS, BELASIS_TOKEN_PREFIX } from "@/lib/constants/belasis.constants"
import type { AgendaSyncStatus } from "@/lib/types/agenda-sync"

interface BelasisIntegrationProps {
  salonId: string
  initialStatus: AgendaSetupStatus
}

type LinkKind = "professionals" | "services"

const primaryButton =
  "inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
const secondaryButton =
  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-muted text-foreground rounded-md text-xs font-medium hover:bg-muted/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
const inputClass =
  "w-full bg-card border border-border rounded-md px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"

/** O mesmo que o servidor faz antes de testar — só para avisar cedo. */
function cleanToken(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^bearer\s+/i, "").replace(/\s+/g, "")
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-foreground text-xs font-bold flex items-center justify-center">
      {n}
    </span>
  )
}

const SYNC_POLL_MS = 3_000

function formatWhen(iso: string | undefined): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

/** Uma linha que o dono entende: o que a última sincronização fez (ou está fazendo). */
function describeSync(status: AgendaSyncStatus | null): string {
  if (!status) {
    return "Traz para cá a agenda da Belasis dos próximos 30 dias, inclusive o que a recepção marcou. Também roda sozinha a cada hora."
  }
  if (status.state === "queued") return "Sincronização na fila…"
  if (status.state === "running") {
    const p = status.progress
    return p && p.total > 0 ? `Sincronizando… ${p.done} de ${p.total}` : "Buscando a agenda na Belasis…"
  }
  if (status.state === "failed") {
    return `A última sincronização falhou (${formatWhen(status.finishedAt)}): ${status.error ?? "erro desconhecido"}`
  }
  const s = status.summary
  if (!s) return `Última sincronização: ${formatWhen(status.finishedAt)}`
  const parts = [
    `${s.imported} trazido(s)`,
    `${s.updated} atualizado(s)`,
    `${s.cancelled} cancelado(s)`,
    s.skippedUnlinked > 0 ? `${s.skippedUnlinked} sem vínculo` : null,
    s.skippedNoPhone > 0 ? `${s.skippedNoPhone} sem telefone` : null,
    s.conflicts > 0 ? `${s.conflicts} em horário já ocupado aqui` : null,
    s.failed > 0 ? `${s.failed} com erro` : null,
  ].filter(Boolean)
  return `Última sincronização (${formatWhen(status.finishedAt)}): ${parts.join(", ")}.`
}

function LinkTable({
  title,
  rows,
  options,
  onChange,
}: {
  title: string
  rows: AgendaLinkRow[]
  options: AgendaCatalogItem[]
  onChange: (internalId: string, externalId: string | null) => void
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-bold text-foreground mb-2">{title}</h4>
        <p className="text-xs text-muted-foreground">Nenhum cadastrado no MinhaAgenda.</p>
      </div>
    )
  }

  return (
    <div>
      <h4 className="text-xs font-bold text-foreground mb-2">{title}</h4>
      <div className="divide-y divide-border border border-border rounded-md">
        {rows.map((row) => {
          const missing = row.externalId !== null && !options.some((o) => o.externalId === row.externalId)
          return (
            <div key={row.internalId} className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2">
              <div className="md:w-1/2 text-sm text-foreground">
                {row.name}
                {row.durationMinutes ? (
                  <span className="text-xs text-muted-foreground"> · {row.durationMinutes} min</span>
                ) : null}
              </div>
              <div className="md:w-1/2 flex items-center gap-2">
                <select
                  value={row.externalId ?? ""}
                  onChange={(e) => onChange(row.internalId, e.target.value || null)}
                  aria-label={`Vínculo de ${row.name} na Belasis`}
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">Não vincular</option>
                  {missing ? <option value={row.externalId!}>Não encontrado na Belasis (#{row.externalId})</option> : null}
                  {options.map((o) => (
                    <option key={o.externalId} value={o.externalId}>
                      {o.name}
                      {o.durationMinutes ? ` · ${o.durationMinutes} min` : ""}
                    </option>
                  ))}
                </select>
                {row.suggested ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent whitespace-nowrap">
                    sugerido
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function BelasisIntegration({ salonId, initialStatus }: BelasisIntegrationProps) {
  const [status, setStatus] = useState<AgendaSetupStatus>(initialStatus)
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [replacingToken, setReplacingToken] = useState(false)
  const [linking, setLinking] = useState<AgendaLinkingData | null>(null)
  const [isPending, startTransition] = useTransition()
  const [syncStatus, setSyncStatus] = useState<AgendaSyncStatus | null>(null)
  const [syncStarting, setSyncStarting] = useState(false)

  const syncRunning = syncStatus?.state === "queued" || syncStatus?.state === "running"

  // Andamento da sincronização: lê ao abrir...
  useEffect(() => {
    if (!status.isActive) return
    let cancelled = false
    void getBelasisSyncStatus(salonId).then((result) => {
      if (!cancelled && "success" in result) setSyncStatus(result.data ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [salonId, status.isActive])

  // ...e acompanha enquanto roda.
  useEffect(() => {
    if (!syncRunning) return
    const timer = setInterval(() => {
      void getBelasisSyncStatus(salonId).then((result) => {
        if ("success" in result && result.data) setSyncStatus(result.data)
      })
    }, SYNC_POLL_MS)
    return () => clearInterval(timer)
  }, [salonId, syncRunning])

  async function handleSync() {
    setSyncStarting(true)
    try {
      const result = await startBelasisSync(salonId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.data?.queued ? "Sincronização iniciada." : "Já tem uma sincronização em andamento.")
      setSyncStatus((prev) =>
        prev?.state === "running" ? prev : { state: "queued", trigger: "manual", queuedAt: new Date().toISOString() }
      )
    } finally {
      setSyncStarting(false)
    }
  }

  const cleaned = cleanToken(token)
  const tokenLooksWrong = cleaned.length > 0 && !cleaned.startsWith(BELASIS_TOKEN_PREFIX)
  const hasLinks = status.linkedProfessionals > 0 && status.linkedServices > 0

  async function refresh() {
    const result = await getBelasisStatus(salonId)
    if ("success" in result && result.data) setStatus(result.data)
  }

  async function loadLinking() {
    const result = await getBelasisLinking(salonId)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    setLinking(result.data ?? null)
  }

  function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await connectBelasis(salonId, token)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setToken("")
      setShowToken(false)
      setReplacingToken(false)
      await refresh()
      if (result.data?.reconnected) {
        toast.success("Token atualizado. Os vínculos continuam os mesmos.")
      } else {
        toast.success("Belasis conectada. Agora vincule profissionais e serviços.")
        await loadLinking()
      }
    })
  }

  function updateLink(kind: LinkKind, internalId: string, externalId: string | null) {
    setLinking((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [kind]: prev[kind].map((row) => {
          if (row.internalId === internalId) return { ...row, externalId, suggested: false }
          // Um item da Belasis só pode ter um par aqui: quem o tinha fica sem.
          if (externalId !== null && row.externalId === externalId) return { ...row, externalId: null, suggested: false }
          return row
        }),
      }
    })
  }

  function handleSaveLinks() {
    if (!linking) return
    const pick = (rows: AgendaLinkRow[]) => rows.map(({ internalId, externalId }) => ({ internalId, externalId }))
    startTransition(async () => {
      const result = await saveBelasisLinks(salonId, {
        professionals: pick(linking.professionals),
        services: pick(linking.services),
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        `Vínculos salvos: ${result.data?.professionals ?? 0} profissionais e ${result.data?.services ?? 0} serviços.`
      )
      setLinking(null)
      await refresh()
    })
  }

  function handleToggleActive(active: boolean) {
    if (
      !active &&
      !confirm(
        "Pausar a Belasis? Pausada, a IA agenda sem consultar a Belasis e pode marcar em cima de um horário que a recepção já ocupou lá."
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await setBelasisActive(salonId, active)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(active ? "Ativada: a IA agora agenda direto na Belasis." : "Integração com a Belasis pausada.")
      await refresh()
    })
  }

  function handleDisconnect() {
    if (!confirm("Desconectar a Belasis? Os vínculos de profissionais e serviços serão apagados.")) return
    startTransition(async () => {
      const result = await disconnectBelasis(salonId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Belasis desconectada.")
      setLinking(null)
      await refresh()
    })
  }

  const badge = status.isActive ? (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
      Ativa
    </span>
  ) : status.connected ? (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
      Falta ativar
    </span>
  ) : null

  return (
    <div className="bg-card border border-border rounded-md p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-bold text-foreground">Belasis — agenda oficial do salão</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Os agendamentos da IA e do painel entram direto na agenda da Belasis, e a IA só oferece horários que
            estão livres lá.
          </p>
        </div>
        {badge}
      </div>

      {status.setupError ? <p className="text-xs text-destructive mb-4">{status.setupError}</p> : null}

      {!status.connected || replacingToken ? (
        <form onSubmit={handleConnect} className="space-y-5">
          <ol className="space-y-4 text-sm text-foreground">
            <li className="flex gap-3">
              <StepNumber n={1} />
              <div>
                <p className="font-medium">Abra a página de API da Belasis</p>
                <a
                  href={BELASIS_LINKS.apiSettings}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${secondaryButton} mt-2`}
                >
                  Abrir Configurações → API <ExternalLink size={12} />
                </a>
                <p className="text-xs text-muted-foreground mt-2">
                  Se a Belasis disser que o recurso de API não está ativo,{" "}
                  <a
                    href={BELASIS_LINKS.apiAddon}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 underline"
                  >
                    ative o adicional de API
                  </a>{" "}
                  na sua conta.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <StepNumber n={2} />
              <div>
                <p className="font-medium">Clique em “Gerar token” e copie</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Se já gerou antes, use “Visualizar Chave”. O token começa com <code>{BELASIS_TOKEN_PREFIX}</code>.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <StepNumber n={3} />
              <div className="flex-1 min-w-0">
                <label htmlFor="belasis-token" className="font-medium">
                  Cole o token aqui
                </label>
                <div className="relative mt-2">
                  <input
                    id="belasis-token"
                    type={showToken ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`${BELASIS_TOKEN_PREFIX}...`}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className={`${inputClass} font-mono pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    aria-label={showToken ? "Esconder token" : "Mostrar token"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {tokenLooksWrong ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">
                    Tokens da Belasis começam com {BELASIS_TOKEN_PREFIX}. Confira se copiou o token inteiro.
                  </p>
                ) : null}
              </div>
            </li>
          </ol>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={isPending || cleaned.length === 0} className={primaryButton}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {isPending ? "Testando..." : "Testar e conectar"}
            </button>
            {replacingToken ? (
              <button
                type="button"
                onClick={() => {
                  setReplacingToken(false)
                  setToken("")
                }}
                disabled={isPending}
                className={secondaryButton}
              >
                Cancelar
              </button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            O token fica guardado cifrado. Conectar não muda nada para a IA: ela só passa a usar a Belasis depois que
            você vincular profissionais e serviços e ativar.
          </p>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profissionais</p>
              <p className="text-sm font-bold text-foreground mt-1">
                {status.linkedProfessionals} de {status.totalProfessionals} vinculados
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Serviços</p>
              <p className="text-sm font-bold text-foreground mt-1">
                {status.linkedServices} de {status.totalServices} vinculados
              </p>
            </div>
          </div>

          {!status.isActive ? (
            <p className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
              Conectada, mas ainda não ativa: a IA segue agendando só no MinhaAgenda. Vincule profissionais e serviços
              e ative.
            </p>
          ) : status.linkedProfessionals < status.totalProfessionals || status.linkedServices < status.totalServices ? (
            <p className="text-xs text-muted-foreground">
              Profissionais e serviços sem vínculo não podem ser agendados pela IA.
            </p>
          ) : null}

          {status.isActive ? (
            <div className="rounded-md border border-border p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {describeSync(syncStatus)}
              </p>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncStarting || syncRunning || isPending}
                className={`${secondaryButton} whitespace-nowrap`}
              >
                {syncStarting || syncRunning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {syncRunning ? "Sincronizando…" : "Sincronizar agora"}
              </button>
            </div>
          ) : null}

          {linking ? (
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">
                Escolha o par de cada um na Belasis. Os marcados como “sugerido” vieram do nome — confira antes de
                salvar.
              </p>
              <LinkTable
                title="Profissionais"
                rows={linking.professionals}
                options={linking.externalProfessionals}
                onChange={(id, ext) => updateLink("professionals", id, ext)}
              />
              <LinkTable
                title="Serviços"
                rows={linking.services}
                options={linking.externalServices}
                onChange={(id, ext) => updateLink("services", id, ext)}
              />
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleSaveLinks} disabled={isPending} className={primaryButton}>
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  Salvar vínculos
                </button>
                <button type="button" onClick={() => setLinking(null)} disabled={isPending} className={secondaryButton}>
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => startTransition(loadLinking)}
                disabled={isPending}
                className={secondaryButton}
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                {status.linkedProfessionals + status.linkedServices > 0
                  ? "Revisar vínculos"
                  : "Vincular profissionais e serviços"}
              </button>
              {status.isActive ? (
                <button type="button" onClick={() => handleToggleActive(false)} disabled={isPending} className={secondaryButton}>
                  Pausar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleActive(true)}
                  disabled={isPending || !hasLinks}
                  title={hasLinks ? undefined : "Vincule pelo menos um profissional e um serviço"}
                  className={primaryButton}
                >
                  Ativar
                </button>
              )}
              <button type="button" onClick={() => setReplacingToken(true)} disabled={isPending} className={secondaryButton}>
                Trocar token
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isPending}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-xs font-bold hover:bg-destructive/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Desconectar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
