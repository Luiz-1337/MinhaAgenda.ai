import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface RefetchIndicatorProps {
  /** Mostra o spinner quando true. Tipicamente `isFetching && !isLoading` do react-query. */
  active?: boolean
  className?: string
}

/**
 * Indicador discreto de atualização em segundo plano (refetch do react-query).
 * Sem layout shift e sem bloquear a tela — pensado para ficar ao lado do título de uma lista:
 *
 *   <RefetchIndicator active={isFetching && !isLoading} />
 */
export function RefetchIndicator({ active = false, className }: RefetchIndicatorProps) {
  if (!active) return null
  return (
    <Loader2
      role="status"
      aria-label="Atualizando"
      className={cn("h-4 w-4 animate-spin text-muted-foreground", className)}
    />
  )
}
