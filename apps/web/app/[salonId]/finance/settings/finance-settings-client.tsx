"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Pencil, Plus, Save, Settings2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  deleteFinancialAccount,
  deleteFinancialCategory,
  saveFinancialAccount,
  saveFinancialCategory,
} from "@/app/actions/finance-settings"
import {
  FINANCIAL_ACCOUNT_KIND_LABELS,
  FINANCIAL_CATEGORY_KIND_LABELS,
} from "@/lib/constants/finance.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import { centsToNumeric } from "@repo/db/src/domain/sales"
import type { FinancialAccountKind, FinancialCategoryKind } from "@repo/db"
import type { FinanceAccountDTO, FinanceCategoryDTO, FinanceSettings } from "@/lib/types/finance"

const ACCOUNT_KINDS = Object.keys(FINANCIAL_ACCOUNT_KIND_LABELS) as FinancialAccountKind[]
const CATEGORY_KINDS: FinancialCategoryKind[] = ["income", "expense"]

const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60 disabled:cursor-not-allowed"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

type AccountDraft = { id?: string; name: string; kind: FinancialAccountKind; openingBalance: string; isActive: boolean }
type CategoryDraft = { id?: string; name: string; kind: FinancialCategoryKind; isActive: boolean }

type PendingDelete = { type: "account"; item: FinanceAccountDTO } | { type: "category"; item: FinanceCategoryDTO }

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300"
          : "inline-flex items-center px-2 py-0.5 rounded-full bg-muted border border-border text-xs font-bold text-muted-foreground"
      }
    >
      {active ? "Ativa" : "Inativa"}
    </span>
  )
}

export function FinanceSettingsClient({ salonId, settings }: { salonId: string; settings: FinanceSettings }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  function run(successMessage: string, action: () => Promise<{ error: string } | { success: true }>, after: () => void) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage)
      after()
      router.refresh()
    })
  }

  function saveAccount() {
    if (!accountDraft) return

    // Saldo inicial aceita negativo (conta que entra no sistema devendo).
    const raw = accountDraft.openingBalance.trim()
    const negative = raw.startsWith("-")
    const parsed = raw === "" ? 0 : parseBRL(raw.replace("-", ""))
    if (parsed === null) {
      toast.error("Informe o saldo inicial")
      return
    }

    run(
      accountDraft.id ? "Conta atualizada" : "Conta criada",
      () =>
        saveFinancialAccount({
          salonId,
          id: accountDraft.id,
          name: accountDraft.name,
          kind: accountDraft.kind,
          openingBalance: negative ? -parsed : parsed,
          isActive: accountDraft.isActive,
        }),
      () => setAccountDraft(null)
    )
  }

  function saveCategory() {
    if (!categoryDraft) return
    run(
      categoryDraft.id ? "Categoria atualizada" : "Categoria criada",
      () =>
        saveFinancialCategory({
          salonId,
          id: categoryDraft.id,
          name: categoryDraft.name,
          kind: categoryDraft.kind,
          isActive: categoryDraft.isActive,
        }),
      () => setCategoryDraft(null)
    )
  }

  function confirmDelete() {
    const target = pendingDelete
    if (!target) return

    if (target.type === "account") {
      run("Conta excluída", () => deleteFinancialAccount(salonId, target.item.id), () => setPendingDelete(null))
    } else {
      run("Categoria excluída", () => deleteFinancialCategory(salonId, target.item.id), () => setPendingDelete(null))
    }
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex items-center gap-4 flex-shrink-0">
        <Link
          href={`/${salonId}/finance`}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Voltar para o financeiro"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Settings2 size={20} className="text-accent" />
            Contas e categorias
          </h2>
          <p className="text-xs text-muted-foreground">Onde o dinheiro fica e como os lançamentos são classificados.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4 space-y-8">
        {/* Contas */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className={labelClass}>Contas</h3>
            <button
              onClick={() => setAccountDraft({ name: "", kind: "bank", openingBalance: "", isActive: true })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              <Plus size={14} />
              Nova conta
            </button>
          </div>

          {settings.accounts.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              Nenhuma conta. Cadastre onde o dinheiro do salão fica: banco, caixa, cofre.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-md divide-y divide-border">
              {settings.accounts.map((account) => (
                <div key={account.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {FINANCIAL_ACCOUNT_KIND_LABELS[account.kind]} · saldo inicial {formatBRL(account.openingBalance)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`font-mono text-sm font-medium tabular-nums ${account.balanceCents < 0 ? "text-destructive" : "text-foreground"}`}
                    >
                      {formatBRL(centsToNumeric(account.balanceCents))}
                    </span>
                    <ActiveBadge active={account.isActive} />
                    <button
                      onClick={() =>
                        setAccountDraft({
                          id: account.id,
                          name: account.name,
                          kind: account.kind,
                          openingBalance: Number(account.openingBalance).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          }),
                          isActive: account.isActive,
                        })
                      }
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label={`Editar a conta ${account.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setPendingDelete({ type: "account", item: account })}
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Excluir a conta ${account.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Categorias */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className={labelClass}>Plano de categorias</h3>
            <div className="flex items-center gap-2">
              {CATEGORY_KINDS.map((kind) => (
                <button
                  key={kind}
                  onClick={() => setCategoryDraft({ name: "", kind, isActive: true })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                >
                  <Plus size={14} />
                  {FINANCIAL_CATEGORY_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {CATEGORY_KINDS.map((kind) => {
              const categories = settings.categories.filter((category) => category.kind === kind)
              return (
                <div key={kind} className="bg-card border border-border rounded-md">
                  <p className="p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {kind === "income" ? "Receitas" : "Despesas"}
                  </p>
                  {categories.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nenhuma categoria.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {categories.map((category) => (
                        <div key={category.id} className="p-3 flex items-center justify-between gap-3">
                          <p className="text-sm text-foreground truncate">{category.name}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <ActiveBadge active={category.isActive} />
                            <button
                              onClick={() =>
                                setCategoryDraft({
                                  id: category.id,
                                  name: category.name,
                                  kind: category.kind,
                                  isActive: category.isActive,
                                })
                              }
                              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              aria-label={`Editar a categoria ${category.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setPendingDelete({ type: "category", item: category })}
                              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              aria-label={`Excluir a categoria ${category.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Conta */}
      <Dialog open={accountDraft !== null} onOpenChange={(open) => !open && !isPending && setAccountDraft(null)}>
        <DialogContent className="!max-w-lg bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">{accountDraft?.id ? "Editar conta" : "Nova conta"}</DialogTitle>
          <FormHeader
            title={accountDraft?.id ? "Editar conta" : "Nova conta"}
            onClose={() => setAccountDraft(null)}
            disabled={isPending}
          />
          {accountDraft && (
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="fa-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="fa-name"
                  type="text"
                  maxLength={60}
                  value={accountDraft.name}
                  onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })}
                  placeholder="Ex: Conta corrente"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="fa-kind" className={labelClass}>
                    Tipo
                  </label>
                  <select
                    id="fa-kind"
                    value={accountDraft.kind}
                    onChange={(event) =>
                      setAccountDraft({ ...accountDraft, kind: event.target.value as FinancialAccountKind })
                    }
                    className={inputClass}
                  >
                    {ACCOUNT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {FINANCIAL_ACCOUNT_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="fa-opening" className={labelClass}>
                    Saldo inicial (R$)
                  </label>
                  <input
                    id="fa-opening"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={accountDraft.openingBalance}
                    onChange={(event) => setAccountDraft({ ...accountDraft, openingBalance: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={accountDraft.isActive}
                  onCheckedChange={(checked) => setAccountDraft({ ...accountDraft, isActive: checked })}
                />
                Ativa (aparece nos lançamentos)
              </label>
            </div>
          )}
          <FormFooter onCancel={() => setAccountDraft(null)} onConfirm={saveAccount} pending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Categoria */}
      <Dialog open={categoryDraft !== null} onOpenChange={(open) => !open && !isPending && setCategoryDraft(null)}>
        <DialogContent className="!max-w-lg bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">{categoryDraft?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          <FormHeader
            title={
              categoryDraft
                ? `${categoryDraft.id ? "Editar" : "Nova"} categoria de ${categoryDraft.kind === "income" ? "receita" : "despesa"}`
                : ""
            }
            onClose={() => setCategoryDraft(null)}
            disabled={isPending}
          />
          {categoryDraft && (
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="fc-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="fc-name"
                  type="text"
                  maxLength={60}
                  value={categoryDraft.name}
                  onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })}
                  placeholder={categoryDraft.kind === "income" ? "Ex: Aluguel de cadeira" : "Ex: Aluguel"}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={categoryDraft.isActive}
                  onCheckedChange={(checked) => setCategoryDraft({ ...categoryDraft, isActive: checked })}
                />
                Ativa (aparece nos lançamentos)
              </label>
            </div>
          )}
          <FormFooter onCancel={() => setCategoryDraft(null)} onConfirm={saveCategory} pending={isPending} />
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={pendingDelete?.type === "account" ? "Excluir conta" : "Excluir categoria"}
        description={`Excluir "${pendingDelete?.item.name}"? Só é possível se nunca foi usada em um lançamento; nesse caso, desative.`}
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}

function FormHeader({ title, onClose, disabled }: { title: string; onClose: () => void; disabled: boolean }) {
  return (
    <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
      <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
      <button
        onClick={onClose}
        disabled={disabled}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50"
        aria-label="Fechar"
      >
        <X size={20} />
      </button>
    </div>
  )
}

function FormFooter({ onCancel, onConfirm, pending }: { onCancel: () => void; onConfirm: () => void; pending: boolean }) {
  return (
    <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/50">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
      <Button onClick={onConfirm} size="lg" loading={pending} className="font-bold shadow-md">
        {!pending && <Save size={18} />}
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  )
}
