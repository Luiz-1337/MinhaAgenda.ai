import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CreditCard, Activity, Coins, AlertTriangle } from "lucide-react"
import { db, profiles, salons, aiUsageStats, sql, inArray, gte } from "@repo/db"
import { listOpenAlerts } from "@/lib/services/alerts/alert.service"

export const dynamic = 'force-dynamic'

async function loadDashboardMetrics() {
    // Janela de 30 dias para consumo de tokens
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const sinceIso = since.toISOString().slice(0, 10) // date (YYYY-MM-DD)

    const [usersRow, plansRow, tokensRow] = await Promise.all([
        db
            .select({ count: sql<number>`count(*)` })
            .from(profiles),
        db
            .select({ count: sql<number>`count(*)` })
            .from(salons)
            .where(inArray(salons.subscriptionStatus, ['ACTIVE', 'PAID'])),
        db
            .select({ total: sql<number>`COALESCE(SUM(${aiUsageStats.credits}), 0)` })
            .from(aiUsageStats)
            .where(gte(aiUsageStats.date, sinceIso)),
    ])

    return {
        totalUsers: Number(usersRow[0]?.count ?? 0),
        activePlans: Number(plansRow[0]?.count ?? 0),
        tokens30d: Number(tokensRow[0]?.total ?? 0),
    }
}

export default async function AdminDashboardPage() {
    const { totalUsers, activePlans, tokens30d } = await loadDashboardMetrics()
    const globalAlerts = await listOpenAlerts({ salonId: null, limit: 50 }).catch(() => [])

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dashboard Administrativo</h1>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalUsers.toLocaleString('pt-BR')}</div>
                        <p className="text-xs text-muted-foreground">Usuários cadastrados</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Planos Ativos</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activePlans.toLocaleString('pt-BR')}</div>
                        <p className="text-xs text-muted-foreground">Assinaturas vigentes</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tokens Consumidos</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{tokens30d.toLocaleString('pt-BR')}</div>
                        <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status do Sistema</CardTitle>
                        {globalAlerts.length > 0
                            ? <AlertTriangle className="h-4 w-4 text-red-500" />
                            : <Activity className="h-4 w-4 text-green-500" />}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {globalAlerts.length > 0 ? `${globalAlerts.length} alerta(s)` : "Online"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {globalAlerts.length > 0 ? "Requer atenção" : "Todos os serviços operando"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {globalAlerts.length > 0 && (
                <Card className="mt-6 border-red-500/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Alertas operacionais abertos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {globalAlerts.map((a) => (
                            <div key={a.id} className="flex items-start gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                                <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${a.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm">{a.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {a.type} · {new Date(a.createdAt).toLocaleString("pt-BR")}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Bem-vindo ao Painel Administrativo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Utilize o menu lateral para gerenciar usuários, planos e monitorar o consumo de tokens do sistema.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
