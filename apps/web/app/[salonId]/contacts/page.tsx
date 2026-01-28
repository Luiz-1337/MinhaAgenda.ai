"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Search, Download, User, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { getSalonCustomers, deleteSalonCustomer, type CustomerRow } from "@/app/actions/customers"
import { useSalon } from "@/contexts/salon-context"
import { CreateContactDialog } from "@/components/features/create-contact-dialog"
import { EditContactDialog } from "@/components/features/edit-contact-dialog"
import { ActionMenu } from "@/components/ui/action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"

function exportCustomersToCSV(customers: CustomerRow[]) {
  const headers = ["Nome", "Telefone", "E-mail", "Preferências"]
  const rows = customers.map((c) => {
    const preferencesText = c.preferences?.notes 
      ? String(c.preferences.notes) 
      : (c.preferences ? JSON.stringify(c.preferences) : "")
    return [c.name, c.phone || "", c.email || "", preferencesText]
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

export default function ContactsPage() {
  const { activeSalon } = useSalon()
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [customerToEdit, setCustomerToEdit] = useState<CustomerRow | null>(null)
  const [customerToDelete, setCustomerToDelete] = useState<CustomerRow | null>(null)
  const pageSize = 20
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!activeSalon) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    startTransition(async () => {
      const result = await getSalonCustomers(activeSalon.id)
      if ("error" in result) {
        toast.error(result.error)
        setCustomers([])
      } else {
        setCustomers(result.data || [])
      }
      setIsLoading(false)
    })
  }, [activeSalon?.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? customers.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ? c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) : false) ||
          (c.email ? c.email.toLowerCase().includes(q) : false)
        )
      : customers
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
    const clampedPage = Math.min(page, totalPages)
    const start = (clampedPage - 1) * pageSize
    return { list: list.slice(start, start + pageSize), total: list.length, clampedPage, totalPages }
  }, [customers, query, page])

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
    if (!activeSalon || !customerToDelete) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const result = await deleteSalonCustomer(customerToDelete.id, activeSalon.id)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Contato removido com sucesso!")
      // Remove o contato da lista
      setCustomers((prev) => prev.filter((c) => c.id !== customerToDelete.id))
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
    // Adiciona o novo contato à lista
    setCustomers((prev) => [newCustomer, ...prev])
  }

  function handleEditSuccess(updatedCustomer: CustomerRow) {
    // Atualiza o contato na lista
    setCustomers((prev) =>
      prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
    )
  }

  function refreshCustomers() {
    if (!activeSalon) return
    
    setIsLoading(true)
    startTransition(async () => {
      const result = await getSalonCustomers(activeSalon.id)
      if ("error" in result) {
        toast.error(result.error)
        setCustomers([])
      } else {
        setCustomers(result.data || [])
      }
      setIsLoading(false)
    })
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <User size={24} className="text-slate-400" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Contatos</h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Listagem dos contatos da sua conta</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
        <div className="relative w-full max-w-xl">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
          />
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
            className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-all"
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-3 pl-2">Nome</div>
          <div className="col-span-2">Telefone</div>
          <div className="col-span-3">E-mail</div>
          <div className="col-span-3">Preferências</div>
          <div className="col-span-1 text-right pr-2">Ações</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 flex-1 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : filtered.list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <User size={32} className="mb-3 opacity-50" />
              <p>{activeSalon ? "Nenhum contato encontrado." : "Selecione um salão para ver os contatos."}</p>
            </div>
          ) : (
            filtered.list.map((contact, index) => (
              <div
                key={contact.id}
                className={`flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-4 items-start md:items-center border-b border-slate-100 dark:border-white/5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${
                  index % 2 === 0 ? "bg-transparent" : "bg-slate-50/30 dark:bg-white/[0.01]"
                }`}
              >
                <div className="md:col-span-3 flex items-center gap-3 md:pl-2 w-full md:w-auto">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10 font-mono">
                    {getInitials(contact.name)}
                  </div>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{contact.name}</span>
                </div>

                <div className="md:col-span-2 text-slate-600 dark:text-slate-400 font-mono text-xs truncate">
                  <span className="text-xs text-slate-400 md:hidden font-medium font-sans">Tel: </span>
                  {contact.phone || "Não informado"}
                </div>

                <div className="md:col-span-3 text-slate-600 dark:text-slate-400 truncate w-full md:w-auto">
                  <span className="text-xs text-slate-400 md:hidden font-medium">E-mail: </span>
                  {contact.email || "Não informado"}
                </div>

                <div className="md:col-span-3 text-slate-600 dark:text-slate-400 text-xs truncate hidden md:block">
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
        {!isLoading && filtered.total > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-medium text-slate-500">
            <div className="w-full sm:w-auto text-center sm:text-left">
              Mostrando <span className="text-slate-900 dark:text-white">{(filtered.clampedPage - 1) * pageSize + 1}</span> a{" "}
              <span className="text-slate-900 dark:text-white">
                {Math.min(filtered.clampedPage * pageSize, filtered.total)}
              </span>{" "}
              de <span className="text-slate-900 dark:text-white">{filtered.total}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={filtered.clampedPage === 1}
                className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={filtered.clampedPage >= filtered.totalPages}
                className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Contact Dialog */}
      {activeSalon && (
        <CreateContactDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          salonId={activeSalon.id}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Edit Contact Dialog */}
      {activeSalon && (
        <EditContactDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open)
            if (!open) {
              setCustomerToEdit(null)
            }
          }}
          salonId={activeSalon.id}
          customer={customerToEdit}
          onSuccess={handleEditSuccess}
        />
      )}

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

