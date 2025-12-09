"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { getAvailability, updateAvailability } from "@/app/actions/availability"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  professional: { id: string; name: string }
}

type Item = { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }

const dayNames = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
]

export default function AvailabilitySheet({ open, onOpenChange, professional }: Props) {
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<Item[]>(() => Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, isActive: false, startTime: "09:00", endTime: "18:00" })))

  useEffect(() => {
    if (!open) return
    startTransition(async () => {
      const res = await getAvailability(professional.id)
      if (Array.isArray(res)) {
        const map = new Map<number, { startTime: string; endTime: string }>()
        for (const r of res) map.set(r.dayOfWeek, { startTime: r.startTime, endTime: r.endTime })
        setItems((prev) => prev.map((it) => {
          const m = map.get(it.dayOfWeek)
          if (!m) return { ...it, isActive: false }
          return { dayOfWeek: it.dayOfWeek, isActive: true, startTime: m.startTime, endTime: m.endTime }
        }))
      } else {
        toast.error(res.error)
      }
    })
  }, [open, professional.id])

  const canSave = useMemo(() => {
    for (const it of items) {
      if (!it.isActive) continue
      if (!/^\d{2}:\d{2}$/.test(it.startTime)) return false
      if (!/^\d{2}:\d{2}$/.test(it.endTime)) return false
    }
    return true
  }, [items])

  function copyToAll(idx: number) {
    const src = items[idx]
    setItems((prev) => prev.map((it) => (it.isActive ? { ...it, startTime: src.startTime, endTime: src.endTime } : it)))
  }

  async function onSave() {
    startTransition(async () => {
      const payload = items.map((it) => ({ dayOfWeek: it.dayOfWeek, startTime: it.startTime, endTime: it.endTime, isActive: it.isActive }))
      const res = await updateAvailability(professional.id, payload)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Disponibilidade atualizada")
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Horários de {professional.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {items.map((it, i) => (
            <div key={it.dayOfWeek} className="flex items-center gap-3">
              <div className="w-24 text-sm font-medium">{dayNames[it.dayOfWeek]}</div>
              <div className="flex items-center gap-2">
                <Switch checked={it.isActive} onCheckedChange={(v) => setItems((prev) => prev.map((p) => (p.dayOfWeek === it.dayOfWeek ? { ...p, isActive: v } : p)))} />
                <span className="text-xs">{it.isActive ? "Ativo" : "Inativo"}</span>
              </div>
              {it.isActive && (
                <div className="flex items-center gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Início</Label>
                    <Input type="time" value={it.startTime} onChange={(e) => setItems((prev) => prev.map((p) => (p.dayOfWeek === it.dayOfWeek ? { ...p, startTime: e.target.value } : p)))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fim</Label>
                    <Input type="time" value={it.endTime} onChange={(e) => setItems((prev) => prev.map((p) => (p.dayOfWeek === it.dayOfWeek ? { ...p, endTime: e.target.value } : p)))} />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => copyToAll(i)}>Copiar para todos</Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="button" disabled={!canSave || isPending} onClick={onSave}>Salvar Alterações</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

