"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Pencil, Plus, Save, ShieldCheck, Trash2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  deleteAccessProfile,
  saveAccessProfile,
  setProfessionalAccess,
} from "@/app/actions/access-profiles"
import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_RESOURCE_HINTS,
  PERMISSION_RESOURCE_LABELS,
} from "@/lib/constants/permissions.constants"
import {
  ALL_PERMISSION_KEYS,
  LEGACY_STAFF_PERMISSIONS,
  PERMISSION_CATALOG,
  type PermissionKey,
  type PermissionResource,
} from "@repo/db/src/domain/permissions"
import type {
  AccessProfileDTO,
  AccessProfilesOverview,
  ProfessionalAccessDTO,
} from "@/lib/types/access-profile"

const RESOURCES = Object.keys(PERMISSION_CATALOG) as PermissionResource[]

/** Valores do seletor de acesso que não são id de perfil. */
const MODE_ROLE = "__role__"
const MODE_CUSTOM = "__custom__"

type MatrixEditor =
  | { kind: "profile"; profile: AccessProfileDTO | null }
  | { kind: "custom"; professional: ProfessionalAccessDTO }

/** A matriz recurso × ação. Controlada: quem usa guarda o conjunto marcado. */
function PermissionMatrix({
  selected,
  onChange,
  disabled,
}: {
  selected: ReadonlySet<PermissionKey>
  onChange: (next: Set<PermissionKey>) => void
  disabled?: boolean
}) {
  function toggle(key: PermissionKey, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(key)
    else next.delete(key)
    onChange(next)
  }

  function toggleResource(resource: PermissionResource, checked: boolean) {
    const next = new Set(selected)
    for (const action of PERMISSION_CATALOG[resource]) {
      const key = `${resource}.${action}` as PermissionKey
      if (checked) next.add(key)
      else next.delete(key)
    }
    onChange(next)
  }

  return (
    <div className="divide-y divide-border border border-border rounded-md">
      {RESOURCES.map((resource) => {
        const actions = PERMISSION_CATALOG[resource]
        const keys = actions.map((action) => `${resource}.${action}` as PermissionKey)
        const allChecked = keys.every((key) => selected.has(key))
        const hint = PERMISSION_RESOURCE_HINTS[resource]

        return (
          <div key={resource} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <div className="sm:w-44 flex-shrink-0">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
                <Checkbox
                  checked={allChecked}
                  disabled={disabled}
                  onChange={(event) => toggleResource(resource, event.target.checked)}
                  aria-label={`Marcar tudo em ${PERMISSION_RESOURCE_LABELS[resource]}`}
                />
                {PERMISSION_RESOURCE_LABELS[resource]}
              </label>
              {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {actions.map((action) => {
                const key = `${resource}.${action}` as PermissionKey
                return (
                  <label key={key} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                    <Checkbox
                      checked={selected.has(key)}
                      disabled={disabled}
                      onChange={(event) => toggle(key, event.target.checked)}
                    />
                    {PERMISSION_ACTION_LABELS[action]}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AccessProfilesClient({
  salonId,
  overview,
}: {
  salonId: string
  overview: AccessProfilesOverview
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [editor, setEditor] = useState<MatrixEditor | null>(null)
  const [draftName, setDraftName] = useState("")
  const [draftKeys, setDraftKeys] = useState<Set<PermissionKey>>(new Set())
  const [profileToDelete, setProfileToDelete] = useState<AccessProfileDTO | null>(null)

  const { profiles, professionals } = overview

  function openProfileEditor(profile: AccessProfileDTO | null) {
    setEditor({ kind: "profile", profile })
    setDraftName(profile?.name ?? "")
    setDraftKeys(new Set(profile?.permissions ?? []))
  }

  function openCustomEditor(professional: ProfessionalAccessDTO) {
    // Ponto de partida do personalizado: o que a pessoa já pode hoje, para a troca
    // não tirar acesso sem que alguém tenha desmarcado nada.
    const profile = profiles.find((p) => p.id === professional.accessProfileId)
    const current =
      professional.customPermissions ??
      profile?.permissions ??
      (professional.role === "MANAGER" ? ALL_PERMISSION_KEYS : LEGACY_STAFF_PERMISSIONS)

    setEditor({ kind: "custom", professional })
    setDraftName("")
    setDraftKeys(new Set(current))
  }

  function closeEditor() {
    if (isPending) return
    setEditor(null)
  }

  function saveEditor() {
    if (!editor) return
    const permissions = Array.from(draftKeys)

    startTransition(async () => {
      const result =
        editor.kind === "profile"
          ? await saveAccessProfile({
              salonId,
              id: editor.profile?.id,
              name: draftName,
              permissions,
            })
          : await setProfessionalAccess({
              salonId,
              professionalId: editor.professional.id,
              mode: "custom",
              permissions,
            })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success(editor.kind === "profile" ? "Perfil salvo" : "Permissões salvas")
      setEditor(null)
      router.refresh()
    })
  }

  function changeProfessionalMode(professional: ProfessionalAccessDTO, value: string) {
    if (value === MODE_CUSTOM) {
      // Só grava ao salvar a matriz — escolher "Personalizado" e fechar não muda nada.
      openCustomEditor(professional)
      return
    }

    startTransition(async () => {
      const result =
        value === MODE_ROLE
          ? await setProfessionalAccess({ salonId, professionalId: professional.id, mode: "role" })
          : await setProfessionalAccess({
              salonId,
              professionalId: professional.id,
              mode: "profile",
              accessProfileId: value,
            })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Acesso atualizado")
      router.refresh()
    })
  }

  function confirmDelete() {
    const profile = profileToDelete
    if (!profile) return

    startTransition(async () => {
      const result = await deleteAccessProfile(salonId, profile.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Perfil excluído")
      setProfileToDelete(null)
      router.refresh()
    })
  }

  const editorTitle =
    editor?.kind === "custom"
      ? `Permissões de ${editor.professional.name}`
      : editor?.profile
        ? "Editar perfil"
        : "Novo perfil"

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0 gap-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/${salonId}/salon-settings`}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Voltar para as configurações do salão"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <ShieldCheck size={20} className="text-accent" />
              Perfis de acesso
            </h2>
            <p className="text-xs text-muted-foreground">
              Defina o que cada pessoa da equipe pode ver e fazer.
            </p>
          </div>
        </div>
        <button
          onClick={() => openProfileEditor(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs font-bold shadow-md transition-all"
        >
          <Plus size={16} />
          Novo perfil
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4 space-y-8">
        {/* Perfis */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Perfis</h3>
          {profiles.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              Nenhum perfil criado. Sem perfil, cada pessoa segue o cargo: gerentes podem tudo e a
              equipe vê agenda, conversas e contatos.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-md divide-y divide-border">
              {profiles.map((profile) => (
                <div key={profile.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{profile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {profile.permissions.length} de {ALL_PERMISSION_KEYS.length} permissões ·{" "}
                      {profile.memberCount === 1 ? "1 pessoa" : `${profile.memberCount} pessoas`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openProfileEditor(profile)}
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label={`Editar o perfil ${profile.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setProfileToDelete(profile)}
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Excluir o perfil ${profile.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Equipe */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Users size={14} />
            Equipe
          </h3>
          {professionals.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              Nenhum profissional cadastrado.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-md divide-y divide-border">
              {professionals.map((professional) => {
                const value =
                  professional.mode === "custom"
                    ? MODE_CUSTOM
                    : professional.mode === "profile" && professional.accessProfileId
                      ? professional.accessProfileId
                      : MODE_ROLE

                return (
                  <div
                    key={professional.id}
                    className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {professional.name}
                        {!professional.isActive && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-muted-foreground">Inativo</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {professional.role === "MANAGER" ? "Gerente" : "Equipe"}
                      </p>
                    </div>

                    {professional.hasFullAccess ? (
                      <span className="text-xs font-semibold text-muted-foreground">
                        Acesso total (proprietário)
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select
                          value={value}
                          disabled={isPending}
                          onValueChange={(next) => changeProfessionalMode(professional, next)}
                        >
                          <SelectTrigger
                            className="w-full sm:w-56"
                            aria-label={`Acesso de ${professional.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={MODE_ROLE}>Padrão do cargo</SelectItem>
                            {profiles.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={MODE_CUSTOM}>Personalizado</SelectItem>
                          </SelectContent>
                        </Select>
                        {professional.mode === "custom" && (
                          <button
                            onClick={() => openCustomEditor(professional)}
                            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            aria-label={`Editar as permissões de ${professional.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Editor da matriz: perfil ou personalizado */}
      <Dialog open={editor !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent
          className="!max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{editorTitle}</DialogTitle>
          <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
            <h2 className="text-lg font-bold text-foreground tracking-tight">{editorTitle}</h2>
            <button
              onClick={closeEditor}
              disabled={isPending}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {editor?.kind === "profile" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="access-profile-name"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Nome do perfil
                </label>
                <input
                  id="access-profile-name"
                  type="text"
                  value={draftName}
                  maxLength={60}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="Ex: Recepção"
                  className="w-full bg-card border border-border rounded-md px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                />
                {editor.profile && editor.profile.memberCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    A alteração vale para{" "}
                    {editor.profile.memberCount === 1
                      ? "a pessoa vinculada"
                      : `as ${editor.profile.memberCount} pessoas vinculadas`}
                    .
                  </p>
                )}
              </div>
            )}

            <PermissionMatrix selected={draftKeys} onChange={setDraftKeys} disabled={isPending} />
          </div>

          <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/50">
            <button
              type="button"
              onClick={closeEditor}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button onClick={saveEditor} size="lg" loading={isPending} className="font-bold shadow-md">
              {!isPending && <Save size={18} />}
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={profileToDelete !== null}
        onClose={() => setProfileToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir perfil"
        description={
          profileToDelete && profileToDelete.memberCount > 0
            ? `O perfil "${profileToDelete.name}" tem ${
                profileToDelete.memberCount === 1 ? "1 pessoa vinculada, que voltará" : `${profileToDelete.memberCount} pessoas vinculadas, que voltarão`
              } a seguir o padrão do cargo. Esta ação não pode ser desfeita.`
            : `Excluir o perfil "${profileToDelete?.name}"? Esta ação não pode ser desfeita.`
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
