/**
 * Dinheiro em reais.
 *
 * Regra que motiva este módulo: as colunas `numeric` do Postgres chegam como
 * STRING pelo driver (`services.price`, `appointments.price_charged`). Somar ou
 * comparar direto produz "100" + "50" = "10050", e o único precedente no repo era
 * um `parseFloat(...).toFixed(2)` solto dentro de um JSX
 * (create-appointment-dialog.tsx). Toda conversão passa por aqui.
 *
 * Sem dependências de propósito: serve RSC, client e o grafo do worker, que roda
 * via tsx e não resolve o alias `@/`.
 */

/** Valor monetário como vem do banco (numeric → string) ou de um form. */
export type MoneyInput = string | number | null | undefined

/**
 * Converte para número. Devolve null quando não há valor utilizável — nunca 0,
 * porque "sem preço" e "cortesia (R$ 0,00)" são coisas diferentes no CRM: a
 * primeira é dado faltando, a segunda é uma decisão do salão.
 */
export function toAmount(value: MoneyInput): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Formata em pt-BR com o símbolo. Sem valor devolve "—", não "R$ 0,00": um
 * atendimento sem preço registrado não pode parecer cortesia na tela.
 */
export function formatBRL(value: MoneyInput, fallback = "—"): string {
  const n = toAmount(value)
  if (n === null) return fallback
  return (
    n
      .toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      // O Intl insere ESPAÇO NÃO-QUEBRÁVEL (U+00A0) entre "R$" e o número. Visualmente
      // idêntico e traiçoeiro: quebra comparação de string, busca na tela, snapshot
      // de teste e o CSV que o dono abre no Excel. Normalizado para espaço comum.
      .replace(/ /g, " ")
  )
}

/**
 * Lê o que o usuário digitou no campo de preço.
 *
 * Aceita as formas que aparecem de verdade num balcão brasileiro: "120",
 * "120,50", "R$ 120,50", "1.200,00" e também "120.50" (teclado numérico). A
 * ambiguidade real é o ponto: em "1.200" é separador de milhar, em "120.50" é
 * decimal. A regra é o número de casas depois do último separador.
 *
 * Devolve null quando não dá para interpretar — quem chama decide o que fazer.
 * Nunca lança.
 */
export function parseBRL(input: string | null | undefined): number | null {
  if (!input) return null

  const cleaned = input.replace(/[^\d.,-]/g, "").trim()
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  const lastSep = Math.max(lastComma, lastDot)

  let normalized: string
  if (lastSep === -1) {
    normalized = cleaned
  } else {
    const decimals = cleaned.length - lastSep - 1
    // 1 ou 2 casas depois do último separador -> ele é o decimal.
    // 3 casas (ou mais) -> era separador de milhar ("1.200", "1,200").
    if (decimals === 1 || decimals === 2) {
      const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "")
      normalized = `${intPart}.${cleaned.slice(lastSep + 1)}`
    } else {
      normalized = cleaned.replace(/[.,]/g, "")
    }
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Para gravar em coluna `numeric(10,2)`: string com 2 casas, sem símbolo. */
export function toNumericString(value: number): string {
  return value.toFixed(2)
}

/**
 * O valor com que o campo "Concluir" deve ABRIR, a partir do catálogo.
 *
 * Sugestão, nunca validação: ~30% dos 144 serviços em produção são faixa
 * min/max, "sob avaliação" ou 0. Nesses casos abre vazio, e quem está no balcão
 * informa o valor combinado — usar o catálogo como proxy gravaria receita errada.
 */
export function suggestedPriceFromService(service: {
  price: string | null
  priceType: string | null
  priceMin: string | null
  priceMax: string | null
  priceOnRequest: boolean | null
}): number | null {
  if (service.priceOnRequest) return null

  if (service.priceType === "range") {
    // Âncora conservadora: o mínimo da faixa. Quem cobrou mais corrige para cima,
    // que é mais fácil de notar do que um valor alto pré-preenchido passar batido.
    const min = toAmount(service.priceMin)
    if (min !== null && min > 0) return min
  }

  const price = toAmount(service.price)
  return price !== null && price > 0 ? price : null
}
