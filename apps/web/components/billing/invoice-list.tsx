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
    case 'paid': return { label: 'Pago', className: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' }
    case 'open': return { label: 'Aberta', className: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
    case 'void': return { label: 'Cancelada', className: 'bg-muted text-muted-foreground border-border' }
    case 'uncollectible': return { label: 'Falhou', className: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' }
    default: return { label: status ?? 'N/A', className: 'bg-muted text-muted-foreground border-border' }
  }
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <div className="bg-card rounded-md border border-border p-8 text-center">
        <Receipt size={32} className="text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-card rounded-md border border-border flex flex-col">
      <div className="p-6 border-b border-border flex justify-between items-center">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <Receipt size={18} className="text-muted-foreground" />
          Historico de Faturas
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
            <tr>
              <th className="px-6 py-3 font-medium">Fatura</th>
              <th className="px-6 py-3 font-medium">Data</th>
              <th className="px-6 py-3 font-medium">Valor</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((inv) => {
              const status = getStatusLabel(inv.status)
              return (
                <tr key={inv.id} className="hover:bg-muted transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground font-mono text-xs">
                    {inv.id.slice(0, 20)}...
                  </td>
                  <td className="px-6 py-4 text-muted-foreground flex items-center gap-2">
                    <Calendar size={14} className="opacity-50" />
                    {formatDate(inv.date)}
                  </td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">
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
                        className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition-colors inline-block"
                      >
                        <Download size={16} />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
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
