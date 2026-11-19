"use client"

import { Download } from "lucide-react"
import { toast } from "sonner"
import { toCsv, type CsvCell } from "@/lib/utils/csv.utils"

export type CsvSheet = { fileName: string; headers: string[]; rows: CsvCell[][] }

/**
 * "Exportar" de um relatório (docs/ROADMAP.md, fase 9, fatia 9f).
 *
 * Exporta o que a tela está mostrando: as mesmas linhas, com os mesmos filtros.
 * A planilha é montada no navegador — o relatório já veio inteiro do servidor,
 * que foi quem conferiu a permissão.
 */
export function ExportCsvButton({ sheet, disabled }: { sheet: () => CsvSheet; disabled?: boolean }) {
  function download() {
    const { fileName, headers, rows } = sheet()
    if (rows.length === 0) {
      toast.warning("Não há linhas para exportar")
      return
    }
    const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} ${rows.length === 1 ? "linha exportada" : "linhas exportadas"}`)
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={disabled}
      title="Baixar em planilha (CSV) o que está na tela"
      className="sm:ml-auto inline-flex items-center justify-center gap-2 px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
    >
      <Download size={16} />
      Exportar
    </button>
  )
}
