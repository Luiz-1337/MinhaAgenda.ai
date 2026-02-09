import { getUsersList } from "@/app/actions/admin/users"
import { UserListTable } from "@/components/admin/users/user-list-table"
import { UserCreateDialog } from "@/components/admin/users/user-create-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react" // Import Search icon

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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Usuários</h1>
                <UserCreateDialog />
            </div>

            <div className="flex items-center gap-2">
                {/* Simple search form using native form submission for now or client component */}
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

            {/* Pagination Controls could go here */}
            <div className="flex items-center justify-end space-x-2 py-4">
                <div className="text-sm text-muted-foreground">
                    Página {pagination?.page} de {pagination?.pages}
                </div>
                {/* Add Next/Prev buttons if needed, logic to update searchParams */}
            </div>
        </div>
    )
}
