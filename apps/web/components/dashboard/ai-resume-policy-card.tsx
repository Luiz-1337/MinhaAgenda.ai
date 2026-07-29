"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Bot, Save } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getAIResumePolicy, setAIResumePolicy } from "@/app/actions/chats"

/**
 * Presets em vez de campo livre de minutos: ninguém quer digitar "120", e a faixa
 * aceita pelo banco (5 min a 14 dias) é grande o bastante para um número solto
 * virar erro de digitação silencioso.
 */
const PRESETS: Array<{ value: string; label: string }> = [
  { value: "never", label: "Nunca — só eu devolvo pelo botão" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "480", label: "8 horas" },
  { value: "1440", label: "1 dia" },
  { value: "4320", label: "3 dias" },
]

export function AIResumePolicyCard({ salonId }: { salonId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [value, setValue] = useState<string>("never")
  const [savedValue, setSavedValue] = useState<string>("never")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAIResumePolicy(salonId)
      .then((res) => {
        if (cancelled) return
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        // Um valor fora dos presets (vindo de outra origem) não deve ser
        // silenciosamente reescrito para "never" — some do select, mas o Salvar
        // fica desabilitado enquanto o dono não escolher, então nada se perde.
        const next = res.minutes === null ? "never" : String(res.minutes)
        setValue(next)
        setSavedValue(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [salonId])

  async function handleSave() {
    setSaving(true)
    try {
      const minutes = value === "never" ? null : Number(value)
      const res = await setAIResumePolicy({ salonId, minutes })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setSavedValue(value)
      toast.success(
        minutes === null
          ? "A IA só voltará quando você devolver a conversa."
          : "Retomada automática salva.",
      )
    } catch {
      toast.error("Não foi possível salvar. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  const dirty = value !== savedValue

  return (
    <div className="bg-card border border-border rounded-md p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-md bg-accent/10 text-accent shrink-0">
          <Bot size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground">Retomada automática da IA</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quando você responde um cliente pelo celular, a IA se cala naquela conversa para não
            falar por cima de você. Escolha quanto tempo de silêncio devolve a conversa para ela.
          </p>

          {loading ? (
            <Skeleton className="h-10 w-full max-w-xs mt-4" />
          ) : (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSave} disabled={!dirty} loading={saving} className="gap-2">
                {!saving && <Save size={16} />}
                Salvar
              </Button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mt-3">
            O tempo conta a partir da sua <strong>última</strong> mensagem, não da primeira — então
            atender o cliente por vários minutos não faz a IA voltar no meio da conversa. Conversas
            que entraram em modo manual por falha de entrega também são devolvidas por essa regra.
          </p>
        </div>
      </div>
    </div>
  )
}
