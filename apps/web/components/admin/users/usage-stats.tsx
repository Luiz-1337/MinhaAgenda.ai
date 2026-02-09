"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins, Zap } from "lucide-react"

interface UsageStatsProps {
    tokens?: number // Not implemented in DB yet? Assuming it might exist or we just simulate
    plan: string
}

export function UsageStats({ tokens = 0, plan }: UsageStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tokens Disponíveis</CardTitle>
                    <Coins className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{tokens}</div>
                    <p className="text-xs text-muted-foreground">
                        Saldo atual para uso de IA
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Plano Atual</CardTitle>
                    <Zap className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{plan}</div>
                    <p className="text-xs text-muted-foreground">
                        Nível de assinatura
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
