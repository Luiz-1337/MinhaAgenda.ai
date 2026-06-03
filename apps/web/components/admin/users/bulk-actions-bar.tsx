"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Loader2, Trash } from "lucide-react"
import { adminBulkDeleteUsers, adminBulkUpdatePlan } from "@/app/actions/admin/users"

interface BulkActionsBarProps {
    selectedIds: string[]
    onDone: () => void
}

export function BulkActionsBar({ selectedIds, onDone }: BulkActionsBarProps) {
    const router = useRouter()
    const [plan, setPlan] = useState<string>("")
    const [applyingPlan, setApplyingPlan] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const applyPlan = async () => {
        if (!plan) {
            toast.error("Selecione um plano")
            return
        }
        setApplyingPlan(true)
        try {
            const res = await adminBulkUpdatePlan(selectedIds, plan as "SOLO" | "PRO" | "ENTERPRISE")
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success(`${res.updated} usuário(s) atualizado(s) para ${plan}.`)
                setPlan("")
                onDone()
                router.refresh()
            }
        } finally {
            setApplyingPlan(false)
        }
    }

    const confirmDelete = async () => {
        setDeleting(true)
        try {
            const res = await adminBulkDeleteUsers(selectedIds)
            if (res.error) {
                toast.error(res.error)
            } else {
                const parts = [`${res.deleted} excluído(s)`]
                if (res.skipped) parts.push(`${res.skipped} ignorado(s)`)
                if (res.errors && res.errors.length) parts.push(`${res.errors.length} com erro`)
                toast.success(parts.join(", "))
                setDeleteOpen(false)
                onDone()
                router.refresh()
            }
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="px-2 text-sm font-medium">{selectedIds.length} selecionado(s)</span>

            <div className="flex items-center gap-2">
                <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Alterar plano" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="SOLO">Solo</SelectItem>
                        <SelectItem value="PRO">Pro</SelectItem>
                        <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                    </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={applyPlan} disabled={applyingPlan}>
                    {applyingPlan && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Aplicar
                </Button>
            </div>

            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash className="mr-2 h-4 w-4" />
                Excluir selecionados
            </Button>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle>Excluir {selectedIds.length} usuário(s)?</DialogTitle>
                        <DialogDescription>
                            Ação irreversível: remove as contas de autenticação, perfis, salões e
                            todos os dados vinculados. Seu próprio usuário, se selecionado, será
                            ignorado.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Excluir permanentemente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
