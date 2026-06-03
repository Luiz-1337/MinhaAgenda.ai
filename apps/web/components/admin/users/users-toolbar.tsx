"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Search, ArrowUpDown } from "lucide-react"

const ALL = "all"

interface UsersToolbarProps {
    search: string
    role?: "admin" | "user"
    plan?: "SOLO" | "PRO" | "ENTERPRISE"
    sort: "createdAt" | "fullName" | "email"
    dir: "asc" | "desc"
}

export function UsersToolbar({ search, role, plan, sort, dir }: UsersToolbarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [searchValue, setSearchValue] = useState(search)

    const navigate = (updates: Partial<Record<string, string>>) => {
        const next: Record<string, string | undefined> = {
            search: searchValue,
            role,
            plan,
            sort,
            dir,
            ...updates,
        }
        const params = new URLSearchParams()
        if (next.search) params.set("search", next.search)
        if (next.role && next.role !== ALL) params.set("role", next.role)
        if (next.plan && next.plan !== ALL) params.set("plan", next.plan)
        if (next.sort && next.sort !== "createdAt") params.set("sort", next.sort)
        if (next.dir && next.dir !== "desc") params.set("dir", next.dir)
        // Filtros mudaram → volta para a primeira página.
        const qs = params.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
    }

    return (
        <div className="flex flex-wrap items-end gap-2">
            <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    navigate({})
                }}
            >
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        name="search"
                        placeholder="Buscar por nome, email ou telefone..."
                        className="pl-9"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                    />
                </div>
                <Button type="submit">Buscar</Button>
            </form>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Função</span>
                <Select value={role ?? ALL} onValueChange={(value) => navigate({ role: value })}>
                    <SelectTrigger className="w-[130px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>Todas</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">Usuário</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Plano</span>
                <Select value={plan ?? ALL} onValueChange={(value) => navigate({ plan: value })}>
                    <SelectTrigger className="w-[130px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>Todos</SelectItem>
                        <SelectItem value="SOLO">Solo</SelectItem>
                        <SelectItem value="PRO">Pro</SelectItem>
                        <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Ordenar por</span>
                <Select value={sort} onValueChange={(value) => navigate({ sort: value })}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="createdAt">Data de criação</SelectItem>
                        <SelectItem value="fullName">Nome</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Button
                variant="outline"
                size="icon"
                title={dir === "asc" ? "Crescente" : "Decrescente"}
                onClick={() => navigate({ dir: dir === "asc" ? "desc" : "asc" })}
            >
                <ArrowUpDown className="h-4 w-4" />
            </Button>
        </div>
    )
}
