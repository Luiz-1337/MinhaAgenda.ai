"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { adminDeleteUser } from "@/app/actions/admin/users"
import { Loader2 } from "lucide-react"

interface AdminDeleteUserDialogProps {
    userId: string
    userName: string
    userEmail: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function AdminDeleteUserDialog({
    userId,
    userName,
    userEmail,
    open,
    onOpenChange,
}: AdminDeleteUserDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [confirmText, setConfirmText] = useState("")
    const router = useRouter()

    const expected = "EXCLUIR"
    const canConfirm = confirmText.trim() === expected && !isLoading

    const handleDelete = async () => {
        if (!canConfirm) return
        setIsLoading(true)
        try {
            const result = await adminDeleteUser(userId)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success("Usuário excluído com sucesso.")
            onOpenChange(false)
            setConfirmText("")
            router.refresh()
        } catch (error) {
            toast.error("Erro ao excluir usuário")
        } finally {
            setIsLoading(false)
        }
    }

    const handleOpenChange = (next: boolean) => {
        if (!next) setConfirmText("")
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Excluir usuário</DialogTitle>
                    <DialogDescription asChild>
                        <div className="space-y-2 text-sm">
                            <p>
                                Esta ação é <strong>irreversível</strong> e irá remover:
                            </p>
                            <ul className="list-disc pl-5 text-muted-foreground">
                                <li>Conta de autenticação (Supabase Auth)</li>
                                <li>Perfil e histórico de pagamentos</li>
                                <li>Todos os salões do usuário e dados vinculados (serviços, produtos, agendamentos, chats, consumo de IA)</li>
                            </ul>
                            <p className="pt-2">
                                Usuário: <strong>{userName || "Sem nome"}</strong> ({userEmail})
                            </p>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="confirm-delete">
                        Digite <span className="font-mono font-semibold">{expected}</span> para confirmar
                    </Label>
                    <Input
                        id="confirm-delete"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoComplete="off"
                    />
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => handleOpenChange(false)}
                        disabled={isLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={!canConfirm}
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Excluir permanentemente
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
