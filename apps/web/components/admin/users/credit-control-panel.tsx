"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
    updateSalonCreditsLimit,
    grantSalonExtraCredits,
    resetSalonMonthlyUsage,
} from "@/app/actions/admin/users"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Coins, Save, RotateCcw, Plus, Minus, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { formatCreditsForDisplay } from "@/lib/utils"

interface CreditControlPanelProps {
    salonId: string
    currentLimit: number | null | undefined
    defaultLimit: number
    extraCredits: number
    credits: { remaining: number; total: number; used: number } | null
}

function parsePositiveInt(value: string): number | null {
    const digits = value.replace(/\D/g, "")
    if (digits === "") return null
    const n = parseInt(digits, 10)
    return isNaN(n) ? null : n
}

export function CreditControlPanel({
    salonId,
    currentLimit,
    defaultLimit,
    extraCredits,
    credits,
}: CreditControlPanelProps) {
    const router = useRouter()

    const [limit, setLimit] = useState<string>(currentLimit ? currentLimit.toString() : "")
    const [grant, setGrant] = useState<string>("")
    const [savingLimit, setSavingLimit] = useState(false)
    const [granting, setGranting] = useState(false)
    const [resetOpen, setResetOpen] = useState(false)
    const [resetting, setResetting] = useState(false)

    const handleSaveLimit = async (override?: number | null) => {
        setSavingLimit(true)
        try {
            let value: number | null
            if (override !== undefined) {
                value = override
            } else if (limit.trim() === "") {
                value = null
            } else {
                const parsed = parsePositiveInt(limit)
                if (parsed === null) {
                    toast.error("Valor inválido", { description: "Insira um número válido." })
                    return
                }
                value = parsed
            }

            const result = await updateSalonCreditsLimit(salonId, value)
            if (result.error) {
                toast.error("Erro ao atualizar", { description: result.error })
            } else {
                toast.success("Limite atualizado", {
                    description: value
                        ? `Limite mensal: ${formatCreditsForDisplay(value)} créditos.`
                        : "Limite customizado removido. Usando padrão do plano.",
                })
                if (value === null) setLimit("")
                router.refresh()
            }
        } finally {
            setSavingLimit(false)
        }
    }

    const handleGrant = async (sign: 1 | -1) => {
        const amount = parsePositiveInt(grant)
        if (!amount || amount <= 0) {
            toast.error("Valor inválido", { description: "Informe um número positivo." })
            return
        }
        setGranting(true)
        try {
            const result = await grantSalonExtraCredits(salonId, sign * amount)
            if (result.error) {
                toast.error("Erro", { description: result.error })
            } else {
                toast.success(
                    sign > 0
                        ? `Concedido ${formatCreditsForDisplay(amount)} créditos extras.`
                        : `Removido ${formatCreditsForDisplay(amount)} créditos extras.`
                )
                setGrant("")
                router.refresh()
            }
        } finally {
            setGranting(false)
        }
    }

    const handleReset = async () => {
        setResetting(true)
        try {
            const result = await resetSalonMonthlyUsage(salonId)
            if (result.error) {
                toast.error("Erro ao zerar consumo", { description: result.error })
            } else {
                toast.success("Consumo do mês zerado", {
                    description: `${result.rowsDeleted ?? 0} registro(s) removido(s).`,
                })
                setResetOpen(false)
                router.refresh()
            }
        } finally {
            setResetting(false)
        }
    }

    const grantPreview = parsePositiveInt(grant)

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Créditos / Tokens de IA</CardTitle>
                        <CardDescription>
                            Limite mensal, créditos extras e consumo do mês.
                        </CardDescription>
                    </div>
                    <Coins className="h-5 w-5 text-accent" />
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Resumo do saldo */}
                {credits && (
                    <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
                        <div>
                            <div className="text-xs text-muted-foreground">Restante</div>
                            <div className="font-semibold">
                                {formatCreditsForDisplay(credits.remaining)}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Usado</div>
                            <div className="font-semibold">
                                {formatCreditsForDisplay(credits.used)}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Total</div>
                            <div className="font-semibold">
                                {formatCreditsForDisplay(credits.total)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Limite mensal */}
                <div className="space-y-2">
                    <Label htmlFor="credit-limit">Limite Mensal Personalizado</Label>
                    <div className="flex gap-2">
                        <Input
                            id="credit-limit"
                            type="number"
                            placeholder={`Padrão do plano: ${formatCreditsForDisplay(defaultLimit)}`}
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                        />
                        <Button
                            size="icon"
                            onClick={() => handleSaveLimit()}
                            disabled={savingLimit}
                            title="Salvar limite"
                        >
                            {savingLimit ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                        </Button>
                        {currentLimit ? (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleSaveLimit(null)}
                                disabled={savingLimit}
                                title="Voltar ao padrão do plano"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {currentLimit
                            ? `Limite atual: ${formatCreditsForDisplay(currentLimit)} créditos/mês.`
                            : `Usando o padrão do plano: ${formatCreditsForDisplay(defaultLimit)} créditos/mês.`}
                    </p>
                </div>

                {/* Créditos extras */}
                <div className="space-y-2">
                    <Label htmlFor="extra-credits">Créditos Extras (acumulados, não expiram)</Label>
                    <div className="flex gap-2">
                        <Input
                            id="extra-credits"
                            type="number"
                            placeholder="Quantidade"
                            value={grant}
                            onChange={(e) => setGrant(e.target.value)}
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleGrant(1)}
                            disabled={granting}
                            title="Adicionar créditos"
                        >
                            {granting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleGrant(-1)}
                            disabled={granting}
                            title="Remover créditos"
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Saldo extra atual: {formatCreditsForDisplay(extraCredits)} créditos.
                        {grantPreview
                            ? ` (operação de ${formatCreditsForDisplay(grantPreview)})`
                            : ""}
                    </p>
                </div>

                {/* Zerar consumo */}
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-3">
                    <div>
                        <p className="text-sm font-medium">Zerar consumo do mês</p>
                        <p className="text-xs text-muted-foreground">
                            Remove o uso de IA registrado no mês atual.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setResetOpen(true)}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Zerar
                    </Button>
                </div>
            </CardContent>

            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Zerar consumo do mês?</DialogTitle>
                        <DialogDescription>
                            Esta ação apaga os registros de consumo de IA do mês atual deste salão.
                            O saldo restante voltará ao total disponível. Não afeta créditos extras.
                            É irreversível.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleReset} disabled={resetting}>
                            {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Zerar consumo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
