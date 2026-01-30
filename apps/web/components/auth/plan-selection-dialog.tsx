"use client"

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlanSelection } from './plan-selection'

interface PlanSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlanSelectionDialog({ open, onOpenChange }: PlanSelectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Escolha seu plano</DialogTitle>
        <PlanSelection variant="dialog" />
      </DialogContent>
    </Dialog>
  )
}

