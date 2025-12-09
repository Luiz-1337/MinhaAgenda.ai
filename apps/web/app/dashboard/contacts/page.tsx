"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table"
import { MoreHorizontal } from "lucide-react"

type Customer = {
  id: string
  name: string
  phone: string
  email?: string
}

const mockCustomers: Customer[] = Array.from({ length: 48 }).map((_, i) => ({
  id: `${i + 1}`,
  name: ["Ana Souza", "Carlos Lima", "Beatriz Nunes", "Diego Ramos", "Marina Alves"][i % 5] + ` ${i + 1}`,
  phone: `(11) 9${String(1000 + i).slice(-4)}-000${i % 10}`,
  email: i % 3 === 0 ? undefined : `user${i + 1}@exemplo.com`,
}))

export default function ContactsPage() {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 20

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? mockCustomers.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
          (c.email ? c.email.toLowerCase().includes(q) : false)
        )
      : mockCustomers
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
    const clampedPage = Math.min(page, totalPages)
    const start = (clampedPage - 1) * pageSize
    return { list: list.slice(start, start + pageSize), total: list.length, clampedPage, totalPages }
  }, [query, page])

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
          <Button variant="outline">Exportar</Button>
        </div>
      </Card>

      <Card className="p-0">
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
            {filtered.list.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{c.name}</span>
                  </div>
                </TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email ?? "Não informado"}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Ver</DropdownMenuItem>
                      <DropdownMenuItem>Editar</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive">Remover</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableCaption>
            Mostrando {(filtered.clampedPage - 1) * pageSize + 1} a {Math.min(filtered.clampedPage * pageSize, filtered.total)} de {filtered.total}
          </TableCaption>
        </Table>
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

