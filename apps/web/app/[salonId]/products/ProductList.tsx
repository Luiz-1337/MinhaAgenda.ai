"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Search, Plus, Package, DollarSign, Tag, X, Save } from "lucide-react"
import { ActionMenu } from "@/components/ui/action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getProducts, upsertProduct, deleteProduct } from "@/app/actions/products"
import type { ProductRow } from "@/lib/types/product"
import { useSalon } from "@/contexts/salon-context"

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  description: z.string().optional().or(z.literal("")),
  price: z.number().positive("Preço deve ser positivo"),
  isActive: z.boolean().default(true),
})
type ProductForm = z.infer<typeof productSchema>

interface ProductListProps {
  salonId: string
}

export default function ProductList({ salonId }: ProductListProps) {
  const { activeSalon } = useSalon()
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [list, setList] = useState<ProductRow[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null)

  const form = useForm<ProductForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(productSchema as any),
    defaultValues: { name: "", description: "", price: 0, isActive: true },
  })

  useEffect(() => {
    if (!salonId) return

    setIsLoading(true)
    startTransition(async () => {
      try {
        const res = await getProducts(salonId)
        if ("error" in res) {
          console.error("Erro ao carregar produtos:", res.error)
          toast.error(res.error)
          setList([])
        } else {
          setList(res.data || [])
        }
      } catch (error) {
        console.error("Erro ao carregar produtos:", error)
        toast.error(error instanceof Error ? error.message : "Erro ao carregar produtos")
        setList([])
      } finally {
        setIsLoading(false)
      }
    })
  }, [salonId])

  const filteredProducts = useMemo(() => {
    return list.filter((product) => {
      const matchesFilter =
        filter === "all" ? true : filter === "active" ? product.is_active : !product.is_active

      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()))

      return matchesFilter && matchesSearch
    })
  }, [list, filter, searchTerm])

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", description: "", price: 0, isActive: true })
    setOpen(true)
  }

  async function openEdit(product: ProductRow) {
    setEditing(product)
    form.reset({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: parseFloat(product.price),
      isActive: product.is_active,
    })
    setOpen(true)
  }

  async function onSubmit(values: ProductForm) {
    if (!salonId) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await upsertProduct({ ...values, salonId })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Produto atualizado" : "Produto criado")
      setOpen(false)
      setEditing(null)
      try {
        const again = await getProducts(salonId)
        if ("error" in again) {
          console.error("Erro ao recarregar produtos:", again.error)
        } else {
          setList(again.data || [])
        }
      } catch (error) {
        console.error("Erro ao recarregar produtos:", error)
      }
    })
  }

  function handleDeleteClick(product: ProductRow) {
    setProductToDelete({ id: product.id, name: product.name })
    setDeleteConfirmOpen(true)
  }

  async function onDelete() {
    if (!salonId || !productToDelete) {
      toast.error("Selecione um salão")
      return
    }

    setDeleteConfirmOpen(false)
    startTransition(async () => {
      const res = await deleteProduct(productToDelete.id, salonId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Produto removido")
      setProductToDelete(null)
      try {
        const again = await getProducts(salonId)
        if ("error" in again) {
          console.error("Erro ao recarregar produtos:", again.error)
        } else {
          setList(again.data || [])
        }
      } catch (error) {
        console.error("Erro ao recarregar produtos:", error)
      }
    })
  }

  function formatPrice(price: string): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(parseFloat(price))
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Package size={24} className="text-slate-400" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Produtos</h2>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Plus size={16} />
          Criar produto
        </button>
      </div>

      {/* Product Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          {/* Header */}
          <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                <Package size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
                  {editing ? "Editar Produto" : "Novo Produto"}
                </h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Configuração de oferta</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              disabled={form.formState.isSubmitting}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Nome do Produto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Shampoo Profissional"
                  {...form.register("name")}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-red-500 mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Descrição Detalhada</label>
                <textarea
                  rows={3}
                  placeholder="Descreva o produto..."
                  {...form.register("description")}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Preço (R$) <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <DollarSign size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    {...form.register("price", { valueAsNumber: true })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                {form.formState.errors.price && (
                  <p className="text-xs text-red-500 mt-1">{form.formState.errors.price.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Switch {...form.register("isActive")} checked={form.watch("isActive")} />
                  <span>Ativo</span>
                </Label>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50/30 dark:bg-white/[0.01]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={form.formState.isSubmitting}
                className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {form.formState.isSubmitting ? "Salvando..." : editing ? "Salvar Produto" : "Criar Produto"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md p-2 rounded-xl border border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "active"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Ativos
          </button>
          <button
            onClick={() => setFilter("inactive")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "inactive"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Inativos
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar produtos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
        {/* Table Header - Hidden on mobile */}
        <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-4 pl-2">Nome</div>
          <div className="col-span-4">Descrição</div>
          <div className="col-span-2">Preço</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right pr-2">Ações</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 flex-1 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Package size={32} className="mb-3 opacity-50" />
              <p>Nenhum produto encontrado.</p>
            </div>
          ) : (
            filteredProducts.map((product, index) => (
              <div
                key={product.id}
                className={`flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-4 items-start md:items-center border-b border-slate-100 dark:border-white/5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${
                  index % 2 === 0 ? "bg-transparent" : "bg-slate-50/30 dark:bg-white/[0.01]"
                }`}
              >
                <div className="md:col-span-4 md:pl-2 font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-2 w-full md:w-auto">
                  <Tag size={14} className="text-slate-400 flex-shrink-0" />
                  {product.name}
                </div>

                <div className="md:col-span-4 text-slate-500 dark:text-slate-400 text-xs truncate w-full md:w-auto" title={product.description || ""}>
                  <span className="text-xs text-slate-400 md:hidden font-medium">Descrição: </span>
                  {product.description || "—"}
                </div>

                <div className="md:col-span-2 text-slate-600 dark:text-slate-300 font-mono text-xs font-medium flex items-center gap-1">
                  <DollarSign size={12} className="text-emerald-500" />
                  {formatPrice(product.price)}
                </div>

                <div className="md:col-span-1 flex items-center gap-2">
                  {product.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-xs font-bold text-slate-400">
                      Inativo
                    </span>
                  )}
                </div>

                <div className="md:col-span-1 flex justify-end md:pr-2 w-full md:w-auto">
                  <ActionMenu
                    onEdit={() => openEdit(product)}
                    onDelete={() => handleDeleteClick(product)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dialog de Confirmação de Exclusão */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setProductToDelete(null)
        }}
        onConfirm={onDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja remover o produto "${productToDelete?.name}"? Esta ação não pode ser desfeita. O produto será removido permanentemente.`}
        confirmText="Remover"
        type="danger"
      />
    </div>
  )
}
