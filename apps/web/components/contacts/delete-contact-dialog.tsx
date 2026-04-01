"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { deleteSalonCustomer } from "@/app/actions/customers"
import type { CustomerRow } from "@/app/actions/customers"

interface DeleteContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: CustomerRow | null
  salonId: string
  onSuccess?: () => void
}

export function DeleteContactDialog({
  open,
  onOpenChange,
  customer,
  salonId,
  onSuccess,
}: DeleteContactDialogProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!customer) return

    startTransition(async () => {
      const result = await deleteSalonCustomer(customer.id, salonId)

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Contato removido com sucesso!")
        onOpenChange(false)
        if (onSuccess) {
          onSuccess()
        }
      }
    })
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!isPending) {
      onOpenChange(newOpen)
    }
  }

  if (!customer) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Remover Contato</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja remover o contato <strong>{customer.name}</strong>?
            Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Removendo..." : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

