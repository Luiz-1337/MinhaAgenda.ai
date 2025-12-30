"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, GraduationCap, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import {
  createKnowledgeItem,
  getKnowledgeItems,
  deleteKnowledgeItem,
  type KnowledgeItem,
} from "@/app/actions/knowledge"
import { getAgent } from "@/app/actions/agents"
import { ConfirmModal } from "@/components/ui/confirm-modal"

type PageProps = {
  params: Promise<{ salonId: string; agentId: string }>
}

export default function TrainingPage({ params }: PageProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [newContent, setNewContent] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<KnowledgeItem | null>(null)
  const [agentName, setAgentName] = useState<string>("")
  const [salonId, setSalonId] = useState<string>("")
  const [agentId, setAgentId] = useState<string>("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // Resolve params
  useEffect(() => {
    params.then((p) => {
      setSalonId(p.salonId)
      setAgentId(p.agentId)
    })
  }, [params])

  // Carrega dados do agente e itens
  useEffect(() => {
    if (!agentId) return

    setIsLoading(true)
    startTransition(async () => {
      // Busca dados do agente
      const agentRes = await getAgent(salonId, agentId)
      if (!("error" in agentRes) && agentRes.data) {
        setAgentName(agentRes.data.name)
      }

      // Busca itens de conhecimento
      const res = await getKnowledgeItems(agentId)
      if ("error" in res) {
        toast.error(res.error)
        setItems([])
      } else {
        setItems(res.data || [])
      }
      setIsLoading(false)
    })
  }, [agentId, salonId])

  async function handleAdd() {
    if (!newContent.trim()) {
      toast.error("O texto não pode estar vazio")
      return
    }

    startTransition(async () => {
      const res = await createKnowledgeItem(agentId, newContent.trim())
      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success("Conhecimento adicionado com sucesso")
      setNewContent("")
      setIsCreateDialogOpen(false)

      // Recarrega a lista
      const refreshRes = await getKnowledgeItems(agentId)
      if (!("error" in refreshRes)) {
        setItems(refreshRes.data || [])
      }
    })
  }

  function handleDeleteClick(item: KnowledgeItem) {
    setItemToDelete(item)
    setIsDeleteDialogOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!itemToDelete) return

    setIsDeleting(itemToDelete.id)
    startTransition(async () => {
      const res = await deleteKnowledgeItem(agentId, itemToDelete.id)
      if ("error" in res) {
        toast.error(res.error)
        setIsDeleting(null)
        return
      }

      toast.success("Conhecimento removido com sucesso")
      setIsDeleting(null)
      setIsDeleteDialogOpen(false)
      setItemToDelete(null)

      // Remove da lista local
      setItems((prev) => prev.filter((item) => item.id !== itemToDelete.id))
    })
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/${salonId}/agents`)}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
              <GraduationCap size={18} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                Treinamentos da IA
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {agentName ? `Agente: ${agentName}` : "Carregando..."}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Plus size={16} />
          Adicionar Conhecimento
        </button>
      </div>

      {/* Description */}
      <div className="bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-200/50 dark:border-indigo-500/20 rounded-xl p-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Adicione textos, regras e políticas que a IA usará para responder dúvidas dos clientes.
          Cada texto será convertido em vetores para busca semântica e usado automaticamente no chat.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={32} className="animate-spin text-indigo-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <GraduationCap size={48} className="mb-4 opacity-50" />
            <p className="text-base font-medium">Nenhum conhecimento cadastrado ainda.</p>
            <p className="text-sm mt-1">Adicione o primeiro conhecimento acima.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="group p-5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl hover:border-indigo-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="flex-1 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {item.content}
                  </p>
                  <button
                    onClick={() => handleDeleteClick(item)}
                    disabled={isDeleting === item.id || isPending}
                    className="flex-shrink-0 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remover conhecimento"
                  >
                    {isDeleting === item.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
                    Metadata: {JSON.stringify(item.metadata)}
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Adicionado em {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => setIsCreateDialogOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                  <Plus size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
                    Adicionar Conhecimento
                  </h2>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                    Treinamento da IA
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={isPending}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Texto do Conhecimento <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Ex: Política de Atraso: Clientes que chegarem com mais de 15 minutos de atraso terão o agendamento cancelado..."
                    rows={12}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    disabled={isPending}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Este texto será convertido em vetores e usado para melhorar as respostas da IA no chat.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex justify-end gap-3">
              <button
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd}
                disabled={isPending || !newContent.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
              >
                {isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmModal
        open={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setItemToDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
        title="Remover Conhecimento"
        description={
          itemToDelete
            ? "Tem certeza que deseja remover este conhecimento? Esta ação não pode ser desfeita."
            : ""
        }
        confirmText="Remover"
        type="danger"
      />
    </div>
  )
}

