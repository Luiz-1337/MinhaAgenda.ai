"use client"

import { Calendar, Download, Receipt } from "lucide-react"

interface Invoice {
  id: string
  date: number
  amount: number
  status: string | null
  pdfUrl: string | null
}

interface InvoiceListProps {
  invoices: Invoice[]
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString('pt-BR')
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case 'paid': return { label: 'Pago', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' }
    case 'open': return { label: 'Aberta', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' }
    case 'void': return { label: 'Cancelada', className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' }
    case 'uncollectible': return { label: 'Falhou', className: 'bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20' }
    default: return { label: status ?? 'N/A', className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' }
  }
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-8 text-center">
        <Receipt size={32} className="text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma fatura encontrada</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
      <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
        <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Receipt size={18} className="text-slate-500" />
          Historico de Faturas
        </h3>
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
            {invoices.map((inv) => {
              const status = getStatusLabel(inv.status)
              return (
                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-200 font-mono text-xs">
                    {inv.id.slice(0, 20)}...
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Calendar size={14} className="opacity-50" />
                    {formatDate(inv.date)}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">
                    {formatCurrency(inv.amount)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors inline-block"
                      >
                        <Download size={16} />
                      </a>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
