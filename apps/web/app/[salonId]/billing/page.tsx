"use client"

import {
  CreditCard,
  Check,
  Zap,
  Calendar,
  Download,
  Shield,
  Infinity,
  ExternalLink,
  Receipt,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

export default function BillingPage() {
  const credits = "∞"
  const nextPayment = "15/12/2025"
  const monthlyAmount = "R$ 299,90"

  const invoices = [
    { id: "INV-2024-001", date: "15/10/2024", amount: "R$ 299,90", status: "paid" },
    { id: "INV-2024-002", date: "15/09/2024", amount: "R$ 299,90", status: "paid" },
    { id: "INV-2024-003", date: "15/08/2024", amount: "R$ 299,90", status: "paid" },
  ]

  const planFeatures = [
    "1 canal WhatsApp Oficial (API)",
    "Atendentes ilimitados",
    "Fila de espera inteligente",
    "Relatórios e métricas avançadas",
    "IA Treinada (GPT-4o)",
    "Suporte prioritário 24/7",
  ]

  function handleManageSubscription() {
    toast.info("Redirecionando para portal de assinatura...")
    // TODO: Implementar redirecionamento para portal de pagamento/assinatura
    // Exemplo: window.open("https://portal.assinatura.com", "_blank")
  }

  function handleChangePaymentMethod() {
    toast.info("Abrindo gerenciamento de método de pagamento...")
    // TODO: Implementar modal/dialog para alterar método de pagamento
  }

  function handleDownloadInvoice(invoiceId: string) {
    toast.success(`Baixando fatura ${invoiceId}...`)
    // TODO: Implementar download da fatura
  }

  function handleViewAllInvoices() {
    toast.info("Carregando todas as faturas...")
    // TODO: Implementar visualização completa de faturas
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
          <CreditCard size={24} className="text-indigo-500" />
          Faturamento
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gerencie sua assinatura, métodos de pagamento e faturas.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
        {/* Top Grid: Plan & Payment Method */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plan Card (Hero) */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-xl shadow-indigo-500/20">
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>

            <div className="relative p-6 sm:p-8 h-full flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-xs font-bold uppercase tracking-wider">
                      Assinatura Ativa
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-indigo-100 bg-indigo-800/30 px-2 py-1 rounded-md border border-white/10">
                      <Sparkles size={10} /> IA Power
                    </span>
                  </div>
                  <h3 className="text-3xl font-bold mb-1">Plano Profissional</h3>
                  <p className="text-indigo-100 text-sm opacity-90">
                    Renovação automática em <span className="font-mono font-bold">{nextPayment}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm opacity-80">Valor mensal</p>
                  <p className="text-3xl font-bold">
                    R$ 299<span className="text-lg opacity-80">,90</span>
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-6 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Créditos Disponíveis</p>
                    <div className="flex items-center gap-2">
                      <Infinity size={24} />
                      <span className="text-sm font-medium">Ilimitado</span>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-white/20"></div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Status</p>
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Shield size={16} />
                      <span className="text-sm font-bold">Seguro & Ativo</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleManageSubscription}
                  className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors shadow-lg flex items-center gap-2"
                >
                  Gerenciar Assinatura
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Payment Method Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 relative overflow-hidden border border-slate-800 shadow-lg flex flex-col justify-between min-h-[220px]">
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-800/50 to-slate-900/50 z-0"></div>

            <div className="relative z-10 flex justify-between items-start">
              <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                <CreditCard size={20} className="text-slate-300" />
              </div>
              <button
                onClick={handleChangePaymentMethod}
                className="text-xs text-slate-400 hover:text-white transition-colors underline"
              >
                Alterar
              </button>
            </div>

            <div className="relative z-10">
              <p className="text-xs text-slate-400 mb-2 uppercase tracking-widest">Método Principal</p>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  </div>
                </div>
                <span className="text-xl font-mono text-slate-200">4242</span>
              </div>
            </div>

            <div className="relative z-10 flex justify-between items-end mt-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Titular</p>
                <p className="text-sm font-medium text-slate-300">NICK SILVA</p>
              </div>
              <div className="opacity-50">
                {/* Visa Logo Simulation */}
                <div className="text-2xl font-bold italic text-white tracking-tighter">VISA</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid: Features & History */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Included Features */}
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Zap size={18} className="text-amber-500" />
              Incluso no seu plano
            </h3>
            <ul className="space-y-3">
              {planFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="mt-0.5 p-0.5 rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Invoice History */}
          <div className="lg:col-span-2 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Receipt size={18} className="text-slate-500" />
                Histórico de Faturas
              </h3>
              <button
                onClick={handleViewAllInvoices}
                className="text-xs text-indigo-500 font-medium hover:underline"
              >
                Ver todas
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 dark:bg-white/5">
                  <tr>
                    <th className="px-6 py-3 font-medium">Fatura</th>
                    <th className="px-6 py-3 font-medium">Data</th>
                    <th className="px-6 py-3 font-medium">Valor</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-200">{inv.id}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Calendar size={14} className="opacity-50" />
                        {inv.date}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{inv.amount}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          Pago
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDownloadInvoice(inv.id)}
                          className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                        >
                          <Download size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

