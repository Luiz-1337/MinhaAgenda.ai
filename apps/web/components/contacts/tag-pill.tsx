"use client"

import { X } from "lucide-react"

export type TagLike = { id: string; name: string; color: string }

/** Paleta padrão para novas tags (espelha as cores dos selos do kanban). */
export const PRESET_TAG_COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#10b981", // green
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#64748b", // slate
] as const

/**
 * Selo colorido de tag. Mesmo estilo do selo do kanban no chat
 * (fundo cor+20, borda cor+40, texto cor). Se `onRemove` for passado,
 * mostra um "x" para remover.
 */
export function TagPill({
  tag,
  onRemove,
  className = "",
}: {
  tag: TagLike
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${className}`}
      style={{
        backgroundColor: tag.color + "20",
        borderColor: tag.color + "40",
        color: tag.color,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-70 -mr-0.5"
          aria-label={`Remover tag ${tag.name}`}
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}
