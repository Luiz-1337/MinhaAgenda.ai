"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateSalonAiRetentionFlag } from "@/app/actions/admin/users"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"

interface AiRetentionToggleProps {
    salonId: string
    initialEnabled: boolean
}

export function AiRetentionToggle({ salonId, initialEnabled }: AiRetentionToggleProps) {
    const [enabled, setEnabled] = useState(initialEnabled)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const handleChange = (next: boolean) => {
        const previous = enabled
        setEnabled(next)

        startTransition(async () => {
            const result = await updateSalonAiRetentionFlag(salonId, next)
            if (result.error) {
                setEnabled(previous)
                toast.error("Erro ao atualizar", { description: result.error })
                return
            }
            toast.success(next ? "Retenção IA ativada" : "Retenção IA desativada")
            router.refresh()
        })
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Retenção IA</CardTitle>
                <Sparkles className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between pt-4">
                    <div className="space-y-1">
                        <Label htmlFor="ai-retention-switch">Mensagens de reengajamento por IA</Label>
                        <p className="text-xs text-muted-foreground">
                            {enabled
                                ? "Pipeline ativo. Clientes inativos podem receber mensagens geradas por IA."
                                : "Pipeline desativado. Apenas templates fixos serão enviados (se configurados)."}
                        </p>
                    </div>
                    <Switch
                        id="ai-retention-switch"
                        checked={enabled}
                        onCheckedChange={handleChange}
                        disabled={isPending}
                    />
                </div>
            </CardContent>
        </Card>
    )
}
