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
        "fixed inset-0 z-[9999] flex items-center justify-center",
        "bg-black/50 backdrop-blur-sm",
        "transition-opacity duration-300"
      )}
      aria-label="Carregando"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "bg-white dark:bg-slate-900 rounded-2xl shadow-2xl",
          "px-8 py-6 flex flex-col items-center gap-4",
          "min-w-[200px] max-w-[90%]",
          "border border-slate-200 dark:border-slate-800"
        )}
      >
        <Spinner size="lg" />
        {loadingMessage && (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center">
            {loadingMessage}
          </p>
        )}
      </div>
    </div>
  )
}



