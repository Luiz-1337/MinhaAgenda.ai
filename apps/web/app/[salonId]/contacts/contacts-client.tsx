"use client"

import { useDeferredValue, useMemo, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { Search, Download, User, Plus, Tag as TagIcon, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { getSalonCustomers, deleteSalonCustomer, type CustomerRow } from "@/app/actions/customers"
import { getSalonTags, type TagRow } from "@/app/actions/customer-tags"
import { ActionMenu } from "@/components/ui/action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { RefetchIndicator } from "@/components/ui/refetch-indicator"
import { TagPill } from "@/components/contacts/tag-pill"
import { ManageTagsDialog } from "@/components/contacts/manage-tags-dialog"
import { formatPhoneBR } from "@/lib/utils/phone.utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

const CreateContactDialog = dynamic(
  () => import("@/components/contacts/create-contact-dialog").then(m => ({ default: m.CreateContactDialog })),
  { ssr: false }
)
const EditContactDialog = dynamic(
  () => import("@/components/contacts/edit-contact-dialog").then(m => ({ default: m.EditContactDialog })),
  { ssr: false }
)

function exportCustomersToCSV(customers: CustomerRow[]) {
  const headers = ["Nome", "Telefone", "E-mail", "Tags", "Preferências"]
  const rows = customers.map((c) => {
    const preferencesText = c.preferences?.notes
      ? String(c.preferences.notes)
      : (c.preferences ? JSON.stringify(c.preferences) : "")
    const tagsText = (c.tags ?? []).map((t) => t.name).join("; ")
    return [c.name, formatPhoneBR(c.phone), c.email || "", tagsText, preferencesText]
  })
  const csv = [headers.join(","), ...rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `contatos-${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

interface ContactsClientProps {
  salonId: string
  initialCustomers: CustomerRow[]
  initialTags: TagRow[]
}

export default function ContactsClient({ salonId, initialCustomers, initialTags }: ContactsClientProps) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false)
  const [customerToEdit, setCustomerToEdit] = useState<CustomerRow | null>(null)
  const [customerToDelete, setCustomerToDelete] = useState<CustomerRow | null>(null)
  const pageSize = 20
  const [, startTransition] = useTransition()

  // react-query keyed no salonId da ROTA; o RSC entrega initialCustomers (sem cold-start).
  const { data: customers = [], isFetching } = useQuery({
    queryKey: ["customers", salonId],
    queryFn: async () => {
      const result = await getSalonCustomers(salonId)
      if ("error" in result) {
        toast.error(result.error)
        return []
      }
      return result.data || []
    },
    initialData: initialCustomers,
  })

  // Catálogo de tags do salão (mesmo padrão: RSC semeia, react-query mantém).
  const { data: tags = [] } = useQuery({
    queryKey: ["customer-tags", salonId],
    queryFn: async () => {
      const result = await getSalonTags(salonId)
      if ("error" in result) {
        toast.error(result.error)
        return []
      }
      return result.data || []
    },
    initialData: initialTags,
  })

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    let list = customers
    if (q) {
      list = list.filter((c) => {
        const byName = c.name.toLowerCase().includes(q)
        const byEmail = c.email ? c.email.toLowerCase().includes(q) : false
        const byPhone = qDigits ? (c.phone ? c.phone.replace(/\D/g, "").includes(qDigits) : false) : false
        return byName || byEmail || byPhone
      })
    }
    if (selectedTagIds.length > 0) {
      list = list.filter((c) => (c.tags ?? []).some((t) => selectedTagIds.includes(t.id)))
    }
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
    const clampedPage = Math.min(page, totalPages)
    const start = (clampedPage - 1) * pageSize
    return { list: list.slice(start, start + pageSize), total: list.length, clampedPage, totalPages }
  }, [customers, deferredQuery, selectedTagIds, page])

  function handleExport() {
    if (customers.length === 0) {
      toast.warning("Não há contatos para exportar")
      return
    }
    exportCustomersToCSV(customers)
    toast.success("Contatos exportados com sucesso")
  }

  function handleEditCustomer(customer: CustomerRow) {
    setCustomerToEdit(customer)
    setIsEditDialogOpen(true)
  }

  function handleRemoveCustomer(customer: CustomerRow) {
    setCustomerToDelete(customer)
    setIsDeleteDialogOpen(true)
  }

  async function handleDeleteCustomer() {
    if (!customerToDelete) {
      toast.error("Selecione um contato")
      return
    }

    startTransition(async () => {
      const result = await deleteSalonCustomer(customerToDelete.id, salonId)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Contato removido com sucesso!")
      // Atualiza cache otimisticamente
      queryClient.setQueryData<CustomerRow[]>(["customers", salonId], (old) =>
        old ? old.filter((c) => c.id !== customerToDelete.id) : []
      )
      setCustomerToDelete(null)
      setIsDeleteDialogOpen(false)
    })
  }

  // Helper para obter iniciais do nome
  function getInitials(name: string): string {
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  // Helper para formatar preferências
  function formatPreferences(preferences: Record<string, unknown> | null): string {
    if (!preferences) return "Sem preferências"

    // Se tiver notes, mostra apenas o notes
    if (preferences.notes && typeof preferences.notes === "string") {
      return preferences.notes.length > 50
        ? preferences.notes.substring(0, 50) + "..."
        : preferences.notes
    }

    // Caso contrário, tenta formatar o objeto
    const text = JSON.stringify(preferences)
    return text.length > 50 ? text.substring(0, 50) + "..." : text
  }

  function handleCreateSuccess(newCustomer: CustomerRow) {
    queryClient.setQueryData<CustomerRow[]>(["customers", salonId], (old) =>
      old ? [newCustomer, ...old] : [newCustomer]
    )
  }

  function handleEditSuccess(updatedCustomer: CustomerRow) {
    queryClient.setQueryData<CustomerRow[]>(["customers", salonId], (old) =>
      old ? old.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c)) : []
    )
  }

  // Tag recém-criada num diálogo: adiciona ao cache do catálogo (sem refetch).
  function handleTagCreated(tag: TagRow) {
    queryClient.setQueryData<TagRow[]>(["customer-tags", salonId], (old) =>
      old ? [...old, tag] : [tag]
    )
  }

  // Catálogo mudou (renomear/recolorir/excluir): revalida catálogo e contatos
  // (os selos embutidos nos contatos precisam refletir a mudança).
  function handleCatalogChanged() {
    queryClient.invalidateQueries({ queryKey: ["customer-tags", salonId] })
    queryClient.invalidateQueries({ queryKey: ["customers", salonId] })
  }

  function toggleTagFilter(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setPage(1)
  }

  const selectedTags = selectedTagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is TagRow => Boolean(t))

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <User size={24} className="text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Contatos</h2>
          <RefetchIndicator active={isFetching} />
        </div>
        <p className="text-sm text-muted-foreground">Listagem dos contatos da sua conta</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 flex-shrink-0">
        <div className="flex flex-1 items-center gap-2 w-full max-w-2xl">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              className="w-full bg-muted border border-border rounded-md pl-10 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring/50 focus:ring-1 focus:ring-ring/50 transition-all placeholder:text-muted-foreground"
            />
          </div>

          {/* Filtro por tag */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap"
              >
                <TagIcon size={16} />
                Tags
                {selectedTagIds.length > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {selectedTagIds.length}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Filtrar por tag</DropdownMenuLabel>
              {tags.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma tag criada ainda</div>
              ) : (
                tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={selectedTagIds.includes(tag.id)}
                    onCheckedChange={() => toggleTagFilter(tag.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
              {selectedTagIds.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { setSelectedTagIds([]); setPage(1) }}>
                    Limpar filtro
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setIsManageTagsOpen(true)}>
                <Settings2 size={14} /> Gerenciar tags
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus size={16} />
            Novo Contato
          </Button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-border hover:bg-muted text-foreground rounded-xl text-sm font-medium transition-all"
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* Chips do filtro de tags ativo */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 -mt-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Filtrando por:</span>
          {selectedTags.map((tag) => (
            <TagPill key={tag.id} tag={tag} onRemove={() => toggleTagFilter(tag.id)} />
          ))}
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-hidden bg-card rounded-md border border-border flex flex-col">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-3 pl-2">Nome</div>
          <div className="col-span-2">Telefone</div>
          <div className="col-span-3">E-mail</div>
          <div className="col-span-3">Preferências</div>
          <div className="col-span-1 text-right pr-2">Ações</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <User size={32} className="mb-3 opacity-50" />
              <p>Nenhum contato encontrado.</p>
            </div>
          ) : (
            filtered.list.map((contact, index) => (
              <div
                key={contact.id}
                className={`flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-4 items-start md:items-center border-b border-border text-sm transition-colors hover:bg-muted ${
                  index % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                }`}
              >
                <div className="md:col-span-3 flex items-center gap-3 md:pl-2 w-full md:w-auto min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border border-border font-mono shrink-0">
                    {getInitials(contact.name)}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground truncate block">{contact.name}</span>
                    {(contact.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {contact.tags.map((t) => (
                          <TagPill key={t.id} tag={t} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 text-muted-foreground font-mono text-xs truncate">
                  <span className="text-xs text-muted-foreground md:hidden font-medium font-sans">Tel: </span>
                  {formatPhoneBR(contact.phone) || "Não informado"}
                </div>

                <div className="md:col-span-3 text-muted-foreground truncate w-full md:w-auto">
                  <span className="text-xs text-muted-foreground md:hidden font-medium">E-mail: </span>
                  {contact.email || "Não informado"}
                </div>

                <div className="md:col-span-3 text-muted-foreground text-xs truncate hidden md:block">
                  {formatPreferences(contact.preferences)}
                </div>

                <div className="md:col-span-1 flex justify-end md:pr-2 w-full md:w-auto">
                  <ActionMenu
                    onEdit={() => handleEditCustomer(contact)}
                    onDelete={() => handleRemoveCustomer(contact)}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer / Pagination */}
        {filtered.total > 0 && (
          <div className="p-4 border-t border-border bg-muted/50 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-medium text-muted-foreground">
            <div className="w-full sm:w-auto text-center sm:text-left">
              Mostrando <span className="text-foreground">{(filtered.clampedPage - 1) * pageSize + 1}</span> a{" "}
              <span className="text-foreground">
                {Math.min(filtered.clampedPage * pageSize, filtered.total)}
              </span>{" "}
              de <span className="text-foreground">{filtered.total}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={filtered.clampedPage === 1}
                className="px-3 py-1.5 border border-border rounded-lg hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={filtered.clampedPage >= filtered.totalPages}
                className="px-3 py-1.5 border border-border rounded-lg hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Contact Dialog */}
      <CreateContactDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        salonId={salonId}
        catalog={tags}
        onSuccess={handleCreateSuccess}
        onTagCreated={handleTagCreated}
      />

      {/* Edit Contact Dialog */}
      <EditContactDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) {
            setCustomerToEdit(null)
          }
        }}
        salonId={salonId}
        customer={customerToEdit}
        catalog={tags}
        onSuccess={handleEditSuccess}
        onTagCreated={handleTagCreated}
      />

      {/* Manage Tags Dialog */}
      <ManageTagsDialog
        open={isManageTagsOpen}
        onOpenChange={setIsManageTagsOpen}
        salonId={salonId}
        catalog={tags}
        onChanged={handleCatalogChanged}
      />

      {/* Delete Contact Dialog */}
      <ConfirmModal
        open={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setCustomerToDelete(null)
        }}
        onConfirm={handleDeleteCustomer}
        title="Remover Contato"
        description={customerToDelete ? `Tem certeza que deseja remover o contato "${customerToDelete.name}"? Esta ação não pode ser desfeita.` : ""}
        confirmText="Remover"
        type="danger"
      />
    </div>
  )
}
