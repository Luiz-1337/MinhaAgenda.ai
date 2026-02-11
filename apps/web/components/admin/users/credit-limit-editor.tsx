"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateSalonCreditsLimit } from "@/app/actions/admin/users"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Coins, Save, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { formatCreditsForDisplay } from "@/lib/utils"

interface CreditLimitEditorProps {
    salonId: string
    currentLimit: number | null | undefined
    defaultLimit: number
}

export function CreditLimitEditor({ salonId, currentLimit, defaultLimit }: CreditLimitEditorProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [limit, setLimit] = useState<string>(currentLimit ? currentLimit.toString() : "")

    const router = useRouter()

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const value = limit.trim() === "" ? null : parseInt(limit.replace(/\D/g, ""))

            if (value !== null && isNaN(value)) {
                toast.error("Valor inválido", {
                    description: "Por favor, insira um número válido.",
                })
                setIsLoading(false)
                return
            }

            const result = await updateSalonCreditsLimit(salonId, value)

            if (result.error) {
                toast.error("Erro ao atualizar", {
                    description: result.error,
                })
            } else {
                toast.success("Limite atualizado", {
                    description: value
                        ? `Limite definido para ${formatCreditsForDisplay(value)} créditos.`
                        : "Limite customizado removido. Usando padrão do plano.",
                })
                router.refresh()
            }
        } catch (error) {
            toast.error("Erro inesperado", {
                description: "Ocorreu um erro ao tentar salvar.",
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleReset = () => {
        setLimit("")
        handleSave()
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Limite de Créditos</CardTitle>
                <Coins className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4 pt-4">
                    <div className="grid gap-2">
                        <Label htmlFor="credit-limit">Limite Mensal Personalizado</Label>
                        <div className="flex gap-2">
                            <Input
                                id="credit-limit"
                                placeholder={`Padrão: ${formatCreditsForDisplay(defaultLimit)}`}
                                value={limit}
                                onChange={(e) => setLimit(e.target.value)}
                                type="number"
                            />
                            <Button size="icon" onClick={handleSave} disabled={isLoading}>
                                <Save className="h-4 w-4" />
                            </Button>
                            {currentLimit && (
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setLimit("")}
                                    disabled={isLoading}
                                    title="Remover limite personalizado"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {currentLimit
                                ? `Atualmente definido para ${formatCreditsForDisplay(currentLimit)} créditos.`
                                : `Usando limite do plano: ${formatCreditsForDisplay(defaultLimit)} créditos.`
                            }
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
