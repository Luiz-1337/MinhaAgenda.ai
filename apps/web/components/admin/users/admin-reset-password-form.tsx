"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { adminResetPassword } from "@/app/actions/admin/users"
import { Loader2, LockKeyhole } from "lucide-react"

interface AdminResetPasswordFormProps {
    userId: string
}

export function AdminResetPasswordForm({ userId }: AdminResetPasswordFormProps) {
    const [newPassword, setNewPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword.length < 6) {
            toast.error("A senha deve ter pelo menos 6 caracteres")
            return
        }

        setIsLoading(true)
        try {
            const result = await adminResetPassword(userId, newPassword)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Senha alterada com sucesso!")
                setNewPassword("")
            }
        } catch (error) {
            toast.error("Erro ao alterar senha")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="border-red-100 dark:border-red-900/20">
            <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4 text-red-500" />
                    Área de Perigo: Alterar Senha
                </CardTitle>
                <CardDescription>
                    Force a alteração da senha deste usuário. O usuário será desconectado de outros dispositivos.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleReset} className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="newPassword">Nova Senha</Label>
                        <Input
                            id="newPassword"
                            type="text" // Visible so admin can see what they generate
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Digite a nova senha"
                        />
                    </div>
                    <Button type="submit" variant="destructive" disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir Senha"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
