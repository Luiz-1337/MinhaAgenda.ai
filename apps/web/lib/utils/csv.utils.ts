/**
 * Planilha (CSV) dos relatórios (docs/ROADMAP.md, fase 9, fatia 9f).
 *
 * Um formato só, pensado para abrir direto no Excel em português:
 *   - separador ponto e vírgula e marca BOM de UTF-8 (acentos certos);
 *   - número com vírgula decimal e sem ponto de milhar — vira número na planilha;
 *   - data como "DD/MM/AAAA";
 *   - quebra de linha CRLF.
 *
 * Tudo aqui é puro: quem baixa o arquivo é o botão (components/reports).
 */

export type CsvCell = string | number | boolean | null | undefined

const BOM = "﻿"

/**
 * Texto que começa com `=`, `+`, `-` ou `@` é lido como FÓRMULA por Excel e
 * Sheets. Nome de cliente, motivo de cancelamento e "como conheceu" são digitados
 * por gente de fora: ganham um apóstrofo na frente e viram texto. Número de
 * verdade (tipo `number`) não passa por aqui.
 */
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function formatCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ""
  if (typeof cell === "boolean") return cell ? "Sim" : "Não"
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return ""
    // Até 3 casas (quantidade de estoque), sem zeros à direita, com vírgula.
    return String(Math.round(cell * 1000) / 1000).replace(".", ",")
  }
  const text = neutralizeFormula(cell)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Monta o CSV: a linha de títulos e as linhas de dados. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(formatCell).join(";"))
  return BOM + lines.join("\r\n") + "\r\n"
}

/** Centavos → reais, como número (a planilha soma). */
export function csvMoney(cents: number | null | undefined): number | null {
  return cents === null || cents === undefined ? null : cents / 100
}

/** "AAAA-MM-DD" → "DD/MM/AAAA". O que não é data sai como veio. */
export function csvDate(day: string | null | undefined): string {
  if (!day) return ""
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day
}

/**
 * Nome de arquivo: minúsculas, sem acento, com hífens.
 * `csvFileName("Extrato de contas", "2026-11-01", "2026-11-19")`
 *   → "extrato-de-contas_2026-11-01_2026-11-19.csv"
 */
export function csvFileName(title: string, ...parts: (string | number | null | undefined)[]): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  const pieces = [title, ...parts.filter((part) => part !== null && part !== undefined && part !== "").map(String)]
    .map(slug)
    .filter(Boolean)
  return `${pieces.join("_") || "relatorio"}.csv`
}
