import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { db, profiles, aiUsageStats } from "@repo/db"
import { desc, sql } from "drizzle-orm"

export default async function TokensPage() {
    // Fetch aggregated token usage (simplified - real implementation would be more complex)
    const totalUsage = await db
        .select({
            totalCredits: sql<number>`COALESCE(SUM(${aiUsageStats.credits}), 0)`,
            model: aiUsageStats.model
        })
        .from(aiUsageStats)
        .groupBy(aiUsageStats.model)
        .orderBy(desc(sql`SUM(${aiUsageStats.credits})`))

    const overallTotal = totalUsage.reduce((acc, curr) => acc + Number(curr.totalCredits), 0)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Consumo de Tokens</h1>
            </div>

            <p className="text-muted-foreground">
                Monitore o consumo de tokens de IA em todo o sistema.
            </p>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Consumido</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{overallTotal.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">tokens</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Modelos Utilizados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{totalUsage.length}</div>
                        <p className="text-xs text-muted-foreground">modelos diferentes</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Média por Modelo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">
                            {totalUsage.length > 0 ? Math.round(overallTotal / totalUsage.length).toLocaleString() : 0}
                        </div>
                        <p className="text-xs text-muted-foreground">tokens</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Consumo por Modelo</CardTitle>
                    <CardDescription>Distribuição de uso entre os diferentes modelos de IA</CardDescription>
                </CardHeader>
                <CardContent>
                    {totalUsage.length > 0 ? (
                        <div className="space-y-4">
                            {totalUsage.map((usage, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                        <span className="font-medium">{usage.model}</span>
                                    </div>
                                    <span className="font-mono text-sm">
                                        {Number(usage.totalCredits).toLocaleString()} tokens
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">
                            Nenhum dado de consumo registrado ainda.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
