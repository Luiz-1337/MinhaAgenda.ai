import { getUsersList } from "@/app/actions/admin/users"
import { UserListTable } from "@/components/admin/users/user-list-table"
import { UserCreateDialog } from "@/components/admin/users/user-create-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

export const dynamic = 'force-dynamic'

function buildPageHref(page: number, search: string) {
    const params = new URLSearchParams()
    params.set("page", String(page))
    if (search) params.set("search", search)
    return `?${params.toString()}`
}

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string }>
}) {
    const { page: pageParam, search: searchParam } = await searchParams
    const page = Number(pageParam) || 1
    const search = searchParam || ""

    const { users, pagination, error } = await getUsersList(page, 10, search)

    if (error) {
        return <div>Erro ao carregar usuários: {error}</div>
    }

    const totalPages = pagination?.pages ?? 1
    const currentPage = pagination?.page ?? 1
    const hasPrev = currentPage > 1
    const hasNext = currentPage < totalPages

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Usuários</h1>
                <UserCreateDialog />
            </div>

            <div className="flex items-center gap-2">
                <form className="flex-1 flex items-center gap-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            name="search"
                            placeholder="Buscar por nome, email ou telefone..."
                            className="pl-9"
                            defaultValue={search}
                        />
                    </div>
                    <Button type="submit">Buscar</Button>
                </form>
            </div>

            <UserListTable users={users || []} />

            <div className="flex items-center justify-end gap-2 py-4">
                <div className="text-sm text-muted-foreground mr-2">
                    Página {currentPage} de {totalPages}
                    {typeof pagination?.total === "number" && (
                        <span className="ml-2">({pagination.total} no total)</span>
                    )}
                </div>

                {hasPrev ? (
                    <Link href={buildPageHref(currentPage - 1, search)}>
                        <Button variant="outline" size="sm">
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Anterior
                        </Button>
                    </Link>
                ) : (
                    <Button variant="outline" size="sm" disabled>
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Anterior
                    </Button>
                )}

                {hasNext ? (
                    <Link href={buildPageHref(currentPage + 1, search)}>
                        <Button variant="outline" size="sm">
                            Próxima
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </Link>
                ) : (
                    <Button variant="outline" size="sm" disabled>
                        Próxima
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                )}
            </div>
        </div>
    )
}
