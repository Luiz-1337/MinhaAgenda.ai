"use client"

import { useState, useEffect, useRef } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { SalonEditForm, type SalonEditFormRef } from "@/components/dashboard/salon-edit-form"
import { getCurrentSalon } from "@/app/actions/salon"
import { useSalon } from "@/contexts/salon-context"
import type { SalonDetails } from "@/app/actions/salon"
import { Store, Save, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function SalonSettingsPage() {
  const { activeSalon } = useSalon()
  const [salonData, setSalonData] = useState<SalonDetails | null>(null)
  const [isLoadingSalon, setIsLoadingSalon] = useState(false)
  const [lastLoadedSalonId, setLastLoadedSalonId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const formRef = useRef<SalonEditFormRef>(null)

  // Função para carregar dados do salão
  const loadSalonData = async (salonId: string) => {
    if (lastLoadedSalonId === salonId && salonData?.id === salonId) {
      return // Já temos os dados corretos
    }
    
    setIsLoadingSalon(true)
    setSalonData(null)
    
    try {
      const result = await getCurrentSalon(salonId)
      if ("error" in result) {
        console.error("Erro ao carregar salão:", result.error)
        setSalonData(null)
        setLastLoadedSalonId(null)
      } else {
        setSalonData(result)
        setLastLoadedSalonId(salonId)
      }
    } catch (error) {
      console.error("Erro ao carregar salão:", error)
      setSalonData(null)
      setLastLoadedSalonId(null)
    } finally {
      setIsLoadingSalon(false)
    }
  }

  // Carrega os dados do salão quando o componente monta ou quando o salão ativo muda
  useEffect(() => {
    if (activeSalon) {
      loadSalonData(activeSalon.id)
    } else {
      setSalonData(null)
      setLastLoadedSalonId(null)
    }
  }, [activeSalon?.id])

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={activeSalon ? `/${activeSalon.id}/settings` : "#"}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
              <Store size={20} className="text-indigo-500" />
              Configurações do Salão
            </h2>
            <p className="text-xs text-slate-500">Gerencie os dados e regras do seu estabelecimento.</p>
          </div>
        </div>
        {salonData && activeSalon && (
          <button
            onClick={() => formRef.current?.submit()}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {isPending ? "Salvando..." : "Salvar Alterações"}
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
        <div className="max-w-1xl">
          {isLoadingSalon ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-20 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-4 w-40" />
                <div className="space-y-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-md border p-3">
                      <Skeleton className="h-6 w-11 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-10 flex-1" />
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-10 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <Skeleton className="h-4 w-28" />
                <div className="space-y-4 rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-11 rounded-full" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="h-6 w-11 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
          ) : salonData && activeSalon ? (
            <SalonEditForm 
              ref={formRef} 
              salon={salonData} 
              salonId={activeSalon.id}
              onPendingChange={setIsPending}
            />
          ) : (
            <div className="py-8 text-center text-slate-400">
              Nenhum salão selecionado. Selecione um salão no menu superior.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

