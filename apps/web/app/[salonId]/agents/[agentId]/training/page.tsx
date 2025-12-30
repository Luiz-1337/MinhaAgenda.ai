"use client"

import { useEffect, useState, useTransition, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, GraduationCap, Loader2, X, Upload, FileText, File } from "lucide-react"
import { toast } from "sonner"
import {
  createKnowledgeItem,
  getKnowledgeItems,
  deleteKnowledgeItem,
  deleteKnowledgeFile,
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
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ file: File; progress: number; status: "pending" | "uploading" | "success" | "error"; error?: string }>>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileToDelete, setFileToDelete] = useState<{ fileName: string; chunkCount: number } | null>(null)
  const [isDeleteFileDialogOpen, setIsDeleteFileDialogOpen] = useState(false)

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

  // Agrupa itens por arquivo
  const groupedItems = items.reduce((acc, item) => {
    const metadata = item.metadata as { source?: string; fileName?: string; fileType?: string; chunkIndex?: number; totalChunks?: number } | null
    if (metadata?.source === "file" && metadata.fileName) {
      const key = metadata.fileName
      if (!acc[key]) {
        acc[key] = {
          fileName: metadata.fileName,
          fileType: metadata.fileType || "unknown",
          chunks: [],
          uploadedAt: item.createdAt,
        }
      }
      acc[key].chunks.push(item)
    } else {
      // Itens não agrupados (texto manual)
      if (!acc["_manual"]) {
        acc["_manual"] = {
          fileName: null,
          fileType: null,
          chunks: [],
          uploadedAt: null,
        }
      }
      acc["_manual"].chunks.push(item)
    }
    return acc
  }, {} as Record<string, { fileName: string | null; fileType: string | null; chunks: KnowledgeItem[]; uploadedAt: Date | null }>)

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    const newUploadingFiles = fileArray.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }))

    let startIndex = 0
    setUploadingFiles((prev) => {
      startIndex = prev.length
      return [...prev, ...newUploadingFiles]
    })

    // Processa cada arquivo
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      const fileIndex = startIndex + i

      try {
        setUploadingFiles((prev) => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex] = { ...updated[fileIndex], status: "uploading", progress: 50 }
          }
          return updated
        })

        const formData = new FormData()
        formData.append("file", file)
        formData.append("agentId", agentId)

        const response = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        })

        const result = await response.json()

        if (!response.ok || result.error) {
          throw new Error(result.error || "Erro ao processar arquivo")
        }

        setUploadingFiles((prev) => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex] = { ...updated[fileIndex], status: "success", progress: 100 }
          }
          return updated
        })

        toast.success(`${file.name} processado com sucesso! ${result.data.chunksCreated} chunks criados.`)

        // Recarrega a lista após um pequeno delay
        setTimeout(async () => {
          const refreshRes = await getKnowledgeItems(agentId)
          if (!("error" in refreshRes)) {
            setItems(refreshRes.data || [])
          }
        }, 1000)
      } catch (error) {
        setUploadingFiles((prev) => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex] = {
              ...updated[fileIndex],
              status: "error",
              error: error instanceof Error ? error.message : "Erro desconhecido",
            }
          }
          return updated
        })
        toast.error(`Erro ao processar ${file.name}: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
      }
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0 && agentId) {
        handleFileUpload(files)
      }
    },
    [agentId]
  )

  async function handleDeleteFileConfirm() {
    if (!fileToDelete) return

    startTransition(async () => {
      const res = await deleteKnowledgeFile(agentId, fileToDelete.fileName)
      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success(`Arquivo removido com sucesso (${res.data.deletedCount} chunks removidos)`)
      setIsDeleteFileDialogOpen(false)
      setFileToDelete(null)

      // Recarrega a lista
      const refreshRes = await getKnowledgeItems(agentId)
      if (!("error" in refreshRes)) {
        setItems(refreshRes.data || [])
      }
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsUploadDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold transition-colors"
          >
            <Upload size={16} />
            Enviar Arquivo
          </button>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus size={16} />
            Adicionar Conhecimento
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-200/50 dark:border-indigo-500/20 rounded-xl p-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Adicione textos, regras e políticas que a IA usará para responder dúvidas dos clientes.
          Cada texto será convertido em vetores para busca semântica e usado automaticamente no chat.
          Você pode adicionar texto manualmente ou enviar arquivos PDF e TXT que serão processados automaticamente.
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
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            {Object.entries(groupedItems).map(([key, group]) => {
              if (key === "_manual") {
                // Itens manuais (não agrupados)
                return group.chunks.map((item) => (
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
                    <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      Adicionado em {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                ))
              }

              // Grupos de arquivos
              return (
                <div
                  key={key}
                  className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden"
                >
                  {/* Header do arquivo */}
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {group.fileType === "pdf" ? (
                        <FileText size={20} className="text-red-500" />
                      ) : (
                        <File size={20} className="text-blue-500" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">
                          {group.fileName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {group.chunks.length} {group.chunks.length === 1 ? "chunk" : "chunks"} •{" "}
                          {group.uploadedAt
                            ? `Enviado em ${new Date(group.uploadedAt).toLocaleDateString("pt-BR")}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFileToDelete({ fileName: group.fileName!, chunkCount: group.chunks.length })
                        setIsDeleteFileDialogOpen(true)
                      }}
                      disabled={isPending}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remover todos os chunks deste arquivo"
                    >
                      <Trash2 size={14} />
                      Remover Arquivo
                    </button>
                  </div>

                  {/* Chunks do arquivo */}
                  <div className="p-4 space-y-3">
                    {group.chunks.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-4 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded">
                                Chunk {((item.metadata as { chunkIndex?: number })?.chunkIndex ?? index) + 1}/
                                {(item.metadata as { totalChunks?: number })?.totalChunks ?? group.chunks.length}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                              {item.content}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteClick(item)}
                            disabled={isDeleting === item.id || isPending}
                            className="flex-shrink-0 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Remover este chunk"
                          >
                            {isDeleting === item.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
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

      {/* Upload Dialog */}
      {isUploadDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => setIsUploadDialogOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                  <Upload size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
                    Enviar Arquivo
                  </h2>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                    PDF ou TXT
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsUploadDialogOpen(false)
                  setUploadingFiles([])
                }}
                disabled={uploadingFiles.some((f) => f.status === "uploading")}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Drag and Drop Area */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                      : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600"
                  }`}
                >
                  <Upload
                    size={48}
                    className={`mx-auto mb-4 ${
                      isDragging ? "text-indigo-500" : "text-slate-400"
                    }`}
                  />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Arraste arquivos aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Suporta arquivos PDF e TXT (máximo 10MB)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFiles.some((f) => f.status === "uploading")}
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Selecionar Arquivos
                  </button>
                </div>

                {/* Uploading Files List */}
                {uploadingFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Arquivos em processamento:
                    </p>
                    {uploadingFiles.map((uploadingFile, index) => (
                      <div
                        key={index}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {uploadingFile.file.name.endsWith(".pdf") ? (
                              <FileText size={16} className="text-red-500" />
                            ) : (
                              <File size={16} className="text-blue-500" />
                            )}
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {uploadingFile.file.name}
                            </span>
                          </div>
                          {uploadingFile.status === "uploading" && (
                            <Loader2 size={16} className="animate-spin text-indigo-500" />
                          )}
                          {uploadingFile.status === "success" && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              ✓ Concluído
                            </span>
                          )}
                          {uploadingFile.status === "error" && (
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                              ✗ Erro
                            </span>
                          )}
                        </div>
                        {uploadingFile.status === "uploading" && (
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div
                              className="bg-indigo-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${uploadingFile.progress}%` }}
                            />
                          </div>
                        )}
                        {uploadingFile.status === "error" && uploadingFile.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {uploadingFile.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsUploadDialogOpen(false)
                  setUploadingFiles([])
                }}
                disabled={uploadingFiles.some((f) => f.status === "uploading")}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Fechar
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

      {/* Delete File Confirmation Dialog */}
      <ConfirmModal
        open={isDeleteFileDialogOpen}
        onClose={() => {
          setIsDeleteFileDialogOpen(false)
          setFileToDelete(null)
        }}
        onConfirm={handleDeleteFileConfirm}
        title="Remover Arquivo"
        description={
          fileToDelete
            ? `Tem certeza que deseja remover todos os chunks do arquivo "${fileToDelete.fileName}"? Esta ação removerá ${fileToDelete.chunkCount} chunks e não pode ser desfeita.`
            : ""
        }
        confirmText="Remover Arquivo"
        type="danger"
      />
    </div>
  )
}

