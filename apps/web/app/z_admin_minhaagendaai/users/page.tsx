import { getUsersList } from "@/app/actions/admin/users"
import { UserListTable } from "@/components/admin/users/user-list-table"
import { UserCreateDialog } from "@/components/admin/users/user-create-dialog"
import { UsersToolbar } from "@/components/admin/users/users-toolbar"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

export const dynamic = 'force-dynamic'

function buildPageHref(page: number, params: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    sp.set("page", String(page))
    for (const [key, value] of Object.entries(params)) {
        if (value) sp.set(key, value)
    }
    return `?${sp.toString()}`
}

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{
        page?: string
        search?: string
        role?: string
        plan?: string
        sort?: string
        dir?: string
    }>
}) {
    const sp = await searchParams
    const page = Number(sp.page) || 1
    const search = sp.search || ""
    const role = sp.role === "admin" || sp.role === "user" ? sp.role : undefined
    const plan =
        sp.plan === "SOLO" || sp.plan === "PRO" || sp.plan === "ENTERPRISE" ? sp.plan : undefined
    const sort =
        sp.sort === "fullName" || sp.sort === "email" ? sp.sort : "createdAt"
    const dir = sp.dir === "asc" ? "asc" : "desc"

    const { users, pagination, error } = await getUsersList({
        page,
        limit: 10,
        search,
        role,
        plan,
        sortBy: sort,
        sortDir: dir,
    })

    if (error) {
        return <div>Erro ao carregar usuários: {error}</div>
    }

    const totalPages = pagination?.pages ?? 1
    const currentPage = pagination?.page ?? 1
    const hasPrev = currentPage > 1
    const hasNext = currentPage < totalPages

    const filterParams = { search, role, plan, sort, dir }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Usuários</h1>
                <UserCreateDialog />
            </div>

            <UsersToolbar search={search} role={role} plan={plan} sort={sort} dir={dir} />

            <UserListTable users={users || []} />

            <div className="flex items-center justify-end gap-2 py-4">
                <div className="text-sm text-muted-foreground mr-2">
                    Página {currentPage} de {totalPages}
                    {typeof pagination?.total === "number" && (
                        <span className="ml-2">({pagination.total} no total)</span>
                    )}
                </div>

                {hasPrev ? (
                    <Link href={buildPageHref(currentPage - 1, filterParams)}>
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
                    <Link href={buildPageHref(currentPage + 1, filterParams)}>
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
