"use client"

import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, MoreHorizontal, Trash } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { AdminDeleteUserDialog } from "./admin-delete-user-dialog"
import { BulkActionsBar } from "./bulk-actions-bar"

interface User {
    id: string
    fullName: string | null
    email: string
    phone: string | null
    systemRole: "admin" | "user"
    tier: "SOLO" | "PRO" | "ENTERPRISE"
    createdAt: Date
}

interface UserListTableProps {
    users: User[]
}

export function UserListTable({ users }: UserListTableProps) {
    const [userToDelete, setUserToDelete] = useState<User | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())

    const allSelected = users.length > 0 && users.every((u) => selected.has(u.id))

    const toggleAll = (checked: boolean) => {
        setSelected(checked ? new Set(users.map((u) => u.id)) : new Set())
    }

    const toggleOne = (id: string, checked: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (checked) next.add(id)
            else next.delete(id)
            return next
        })
    }

    const clearSelection = () => setSelected(new Set())

    return (
        <div className="space-y-3">
            {selected.size > 0 && (
                <BulkActionsBar selectedIds={[...selected]} onDone={clearSelection} />
            )}

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">
                                <Checkbox
                                    checked={allSelected}
                                    onChange={(e) => toggleAll(e.target.checked)}
                                    aria-label="Selecionar todos"
                                />
                            </TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Função</TableHead>
                            <TableHead>Plano</TableHead>
                            <TableHead>Criado em</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id} data-state={selected.has(user.id) ? "selected" : undefined}>
                                <TableCell>
                                    <Checkbox
                                        checked={selected.has(user.id)}
                                        onChange={(e) => toggleOne(user.id, e.target.checked)}
                                        aria-label={`Selecionar ${user.email}`}
                                    />
                                </TableCell>
                                <TableCell className="font-medium">{user.fullName || "Sem nome"}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <Badge variant={user.systemRole === "admin" ? "default" : "outline"}>
                                        {user.systemRole === "admin" ? "Admin" : "Usuário"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">{user.tier}</Badge>
                                </TableCell>
                                <TableCell>
                                    {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Abrir menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                            <DropdownMenuItem asChild>
                                                <Link href={`/z_admin_minhaagendaai/users/${user.id}`}>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    Editar
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="text-red-600 focus:text-red-600"
                                                onSelect={(e) => {
                                                    e.preventDefault()
                                                    setUserToDelete(user)
                                                }}
                                            >
                                                <Trash className="mr-2 h-4 w-4" />
                                                Excluir
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {users.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    Nenhum usuário encontrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {userToDelete && (
                <AdminDeleteUserDialog
                    userId={userToDelete.id}
                    userName={userToDelete.fullName || ""}
                    userEmail={userToDelete.email}
                    open={!!userToDelete}
                    onOpenChange={(open) => {
                        if (!open) setUserToDelete(null)
                    }}
                />
            )}
        </div>
    )
}
