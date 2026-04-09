"use client"

import { useLoading } from "@/contexts/loading-context"
import { Spinner } from "./spinner"
import { cn } from "@/lib/utils"

export function LoadingOverlay() {
  const { isLoading, loadingMessage } = useLoading()

  if (!isLoading) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-black/50",
        "transition-opacity duration-300"
      )}
      aria-label="Carregando"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "bg-card rounded-md",
          "px-8 py-6 flex flex-col items-center gap-4",
          "min-w-[200px] max-w-[90%]",
          "border border-border"
        )}
      >
        <Spinner size="lg" />
        {loadingMessage && (
          <p className="text-sm font-medium text-foreground text-center">
            {loadingMessage}
          </p>
        )}
      </div>
    </div>
  )
}
