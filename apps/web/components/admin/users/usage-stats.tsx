"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins, Zap, Activity } from "lucide-react"
import { formatCreditsForDisplay } from "@/lib/utils"

interface UsageStatsProps {
    plan: string
    credits: { remaining: number; total: number; used: number } | null
}

export function UsageStats({ plan, credits }: UsageStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Plano Atual</CardTitle>
                    <Zap className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{plan}</div>
                    <p className="text-xs text-muted-foreground">Nível de assinatura</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Créditos Restantes</CardTitle>
                    <Coins className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {credits ? (
                        <>
                            <div className="text-2xl font-bold">
                                {formatCreditsForDisplay(credits.remaining)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                de {formatCreditsForDisplay(credits.total)} no mês
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="text-2xl font-bold text-muted-foreground">—</div>
                            <p className="text-xs text-muted-foreground">
                                Usuário sem salão (sem consumo de IA)
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Usado no mês</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {credits ? formatCreditsForDisplay(credits.used) : "—"}
                    </div>
                    <p className="text-xs text-muted-foreground">Consumo de IA no mês atual</p>
                </CardContent>
            </Card>
        </div>
    )
}
