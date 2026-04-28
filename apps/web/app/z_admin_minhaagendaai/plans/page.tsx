import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Zap, Star, Crown } from "lucide-react"
import { db, profiles, sql } from "@repo/db"

export const dynamic = 'force-dynamic'

const plans = [
    {
        name: "Solo",
        price: "R$ 299/mês",
        icon: Zap,
        color: "text-chart-1",
        bgColor: "bg-chart-1/10",
        features: ["1 Salão", "1 Agente AI", "5.000 Tokens/mês", "Suporte por Email"]
    },
    {
        name: "Pro",
        price: "R$ 999/mês",
        icon: Star,
        color: "text-accent",
        bgColor: "bg-accent/10",
        features: ["3 Salões", "3 Agentes AI", "25.000 Tokens/mês", "Integrações Avançadas", "Suporte Prioritário"]
    },
    {
        name: "Enterprise",
        price: "Sob Consulta",
        icon: Crown,
        color: "text-chart-4",
        bgColor: "bg-chart-4/10",
        features: ["Salões Ilimitados", "Agentes Ilimitados", "Tokens Ilimitados", "API Dedicada", "Gerente de Conta"]
    },
]

async function loadTierCounts() {
    const rows = await db
        .select({ tier: profiles.tier, count: sql<number>`count(*)` })
        .from(profiles)
        .groupBy(profiles.tier)

    const counts: Record<"SOLO" | "PRO" | "ENTERPRISE", number> = {
        SOLO: 0,
        PRO: 0,
        ENTERPRISE: 0,
    }

    for (const row of rows) {
        const tier = row.tier as keyof typeof counts
        if (tier in counts) counts[tier] = Number(row.count)
    }

    return counts
}

export default async function PlansPage() {
    const counts = await loadTierCounts()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Gestão de Planos</h1>
            </div>

            <p className="text-muted-foreground">
                Visualize e gerencie os planos disponíveis no sistema. A alteração de planos de usuários é feita na página de detalhes do usuário.
            </p>

            <div className="grid gap-6 md:grid-cols-3">
                {plans.map((plan) => (
                    <Card key={plan.name} className="relative overflow-hidden">
                        <div className={`absolute top-0 right-0 w-32 h-32 ${plan.bgColor} rounded-full opacity-50 -translate-y-1/2 translate-x-1/2`}></div>
                        <CardHeader className="relative">
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`p-2 rounded-lg ${plan.bgColor}`}>
                                    <plan.icon className={`h-5 w-5 ${plan.color}`} />
                                </div>
                                <CardTitle>{plan.name}</CardTitle>
                            </div>
                            <CardDescription className="text-2xl font-bold text-foreground">
                                {plan.price}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {plan.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <div className={`w-1.5 h-1.5 rounded-full ${plan.color.replace('text-', 'bg-')}`}></div>
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="text-lg">Estatísticas de Planos</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-sm text-muted-foreground">Usuários Solo</p>
                            <p className="text-2xl font-bold">{counts.SOLO.toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-sm text-muted-foreground">Usuários Pro</p>
                            <p className="text-2xl font-bold">{counts.PRO.toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-sm text-muted-foreground">Usuários Enterprise</p>
                            <p className="text-2xl font-bold">{counts.ENTERPRISE.toLocaleString('pt-BR')}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
