import { getAuditLogs } from "@/app/actions/admin/audit"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export const dynamic = "force-dynamic"

const ACTION_LABELS: Record<string, string> = {
    "user.create": "Criou usuário",
    "user.update": "Editou usuário",
    "user.email_change": "Alterou email",
    "user.reset_password": "Redefiniu senha",
    "user.delete": "Excluiu usuário",
    "user.bulk_delete": "Exclusão em massa",
    "user.bulk_plan_update": "Plano em massa",
    "credits.limit_update": "Ajustou limite",
    "credits.grant": "Concedeu créditos",
    "credits.reset_usage": "Zerou consumo",
    "salon.ai_retention": "Retenção IA",
}

function actionLabel(action: string) {
    return ACTION_LABELS[action] ?? action
}

function buildPageHref(page: number, action: string) {
    const sp = new URLSearchParams()
    sp.set("page", String(page))
    if (action) sp.set("action", action)
    return `?${sp.toString()}`
}

export default async function AuditPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; action?: string }>
}) {
    const sp = await searchParams
    const page = Number(sp.page) || 1
    const action = sp.action || ""

    const { logs, pagination, error } = await getAuditLogs({
        page,
        limit: 20,
        action: action || undefined,
    })

    if (error) {
        return <div>Erro ao carregar auditoria: {error}</div>
    }

    const totalPages = pagination?.pages ?? 1
    const currentPage = pagination?.page ?? 1

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Auditoria</h1>
                <p className="text-sm text-muted-foreground">
                    Registro de todas as ações administrativas realizadas no painel.
                </p>
            </div>

            <form method="get" className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                    <label htmlFor="action" className="text-xs text-muted-foreground">
                        Filtrar por ação
                    </label>
                    <select
                        id="action"
                        name="action"
                        defaultValue={action}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        <option value="">Todas</option>
                        {Object.entries(ACTION_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
                <Button type="submit" variant="outline">
                    Filtrar
                </Button>
            </form>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data/Hora</TableHead>
                            <TableHead>Admin</TableHead>
                            <TableHead>Ação</TableHead>
                            <TableHead>Alvo</TableHead>
                            <TableHead>Detalhes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(logs || []).map((log) => (
                            <TableRow key={log.id}>
                                <TableCell className="whitespace-nowrap text-sm">
                                    {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", {
                                        locale: ptBR,
                                    })}
                                </TableCell>
                                <TableCell className="text-sm">{log.adminEmail}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{actionLabel(log.action)}</Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                    {log.targetLabel ? (
                                        <span>
                                            {log.targetLabel}
                                            {log.targetType ? (
                                                <span className="ml-1 text-xs text-muted-foreground">
                                                    ({log.targetType})
                                                </span>
                                            ) : null}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="max-w-xs">
                                    {log.details ? (
                                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                            {JSON.stringify(log.details)}
                                        </pre>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {(!logs || logs.length === 0) && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    Nenhum registro encontrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-end gap-2 py-4">
                <div className="mr-2 text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                    {typeof pagination?.total === "number" && (
                        <span className="ml-2">({pagination.total} no total)</span>
                    )}
                </div>

                {currentPage > 1 ? (
                    <Link href={buildPageHref(currentPage - 1, action)}>
                        <Button variant="outline" size="sm">
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Anterior
                        </Button>
                    </Link>
                ) : (
                    <Button variant="outline" size="sm" disabled>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Anterior
                    </Button>
                )}

                {currentPage < totalPages ? (
                    <Link href={buildPageHref(currentPage + 1, action)}>
                        <Button variant="outline" size="sm">
                            Próxima
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </Link>
                ) : (
                    <Button variant="outline" size="sm" disabled>
                        Próxima
                        <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
