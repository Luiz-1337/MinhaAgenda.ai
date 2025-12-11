"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { MoreHorizontal } from "lucide-react"
import { getSalonCustomers, type CustomerRow } from "@/app/actions/customers"
import { useSalon } from "@/contexts/salon-context"

function exportCustomersToCSV(customers: CustomerRow[]) {
  const headers = ["Nome", "Telefone", "E-mail"]
  const rows = customers.map((c) => [c.name, c.phone || "", c.email || ""])
  const csv = [headers.join(","), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(","))].join("\n")
  
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
  const pageSize = 20
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!activeSalon) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    startTransition(async () => {
      const result = await getSalonCustomers(activeSalon.id)
      if (Array.isArray(result)) {
        setCustomers(result)
      } else {
        toast.error(result.error)
        setCustomers([])
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

  function handleViewCustomer(customer: CustomerRow) {
    toast.info(`Visualizando: ${customer.name}`)
    // TODO: Implementar modal/dialog para visualizar detalhes do cliente
  }

  function handleEditCustomer(customer: CustomerRow) {
    toast.info(`Editando: ${customer.name}`)
    // TODO: Implementar modal/dialog para editar cliente
  }

  function handleRemoveCustomer(customer: CustomerRow) {
    if (confirm(`Tem certeza que deseja remover o contato "${customer.name}"?`)) {
      toast.info(`Removendo: ${customer.name}`)
      // TODO: Implementar chamada à API para remover cliente
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contatos</h1>
        <p className="text-muted-foreground">Listagem dos contatos da sua conta</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            className="md:max-w-sm"
          />
          <Button variant="outline" onClick={handleExport}>Exportar</Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-10 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {activeSalon ? "Nenhum contato encontrado." : "Selecione um salão para ver os contatos."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {c.name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{c.phone || "Não informado"}</TableCell>
                    <TableCell>{c.email || "Não informado"}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewCustomer(c)}>Ver</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditCustomer(c)}>Editar</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => handleRemoveCustomer(c)}>Remover</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {filtered.total > 0 && (
              <TableCaption>
                Mostrando {(filtered.clampedPage - 1) * pageSize + 1} a {Math.min(filtered.clampedPage * pageSize, filtered.total)} de {filtered.total}
              </TableCaption>
            )}
          </Table>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" disabled={filtered.clampedPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Anterior
        </Button>
        <Button variant="outline" disabled={filtered.clampedPage >= filtered.totalPages} onClick={() => setPage((p) => p + 1)}>
          Próximo
        </Button>
      </div>
    </div>
  )
}

