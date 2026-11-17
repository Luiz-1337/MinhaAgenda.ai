/**
 * Quantidade de estoque na tela (docs/ROADMAP.md, fase 4).
 *
 * A coluna é numeric(12,3): três casas são comuns (gramas, mililitros), por isso
 * isto não reaproveita o que existe para dinheiro.
 *
 * Mostrar e editar são coisas diferentes: o texto que vai para um CAMPO tem que
 * voltar a ser o mesmo número quando for lido. "1.000 ml" é bom de ler e péssimo de
 * reler — por isso `quantityToInput` não põe separador de milhar.
 */

/** "12.500" → "12,5"; "1000.000" → "1.000". Para MOSTRAR, com separador de milhar. */
export function formatQuantity(value: string | number): string {
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 })
}

/** "1000.000" → "1000"; "0.250" → "0,25". Para pôr num CAMPO: sem separador de milhar. */
export function quantityToInput(value: string | number): string {
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false })
}

/**
 * Quantidade digitada → número, lendo como quem escreve em português:
 *
 *   - com vírgula, a vírgula é o decimal e o ponto é milhar ("1.250,5" = 1250,5);
 *   - sem vírgula, ponto seguido de exatamente três dígitos é milhar ("1.000" = mil,
 *     "12.500" = doze mil e quinhentos) — salvo quando a parte inteira é zero
 *     ("0.250" = um quarto);
 *   - qualquer outro ponto é decimal ("1.5" = um e meio).
 *
 * Devolve NULL para o que não é número.
 */
export function parseQuantity(input: string): number | null {
  const cleaned = input.replace(/\s/g, "")
  if (!cleaned || !/^[\d.,]+$/.test(cleaned)) return null

  let normalized: string
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "")
  } else {
    normalized = cleaned
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}
