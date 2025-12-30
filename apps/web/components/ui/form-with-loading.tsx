"use client"

import { ReactNode, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { useLoading } from "@/contexts/loading-context"

interface FormWithLoadingProps {
  children: ReactNode
  loadingMessage?: string
}

/**
 * Wrapper para formulários que automaticamente mostra o loading overlay
 * quando o formulário está sendo submetido
 */
export function FormWithLoading({ children, loadingMessage = "Processando..." }: FormWithLoadingProps) {
  const { pending } = useFormStatus()
  const { setLoading } = useLoading()

  useEffect(() => {
    if (pending) {
      setLoading(true, loadingMessage)
    } else {
      setLoading(false)
    }
  }, [pending, loadingMessage, setLoading])

  return <>{children}</>
}



