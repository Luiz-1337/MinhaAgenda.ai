/**
 * Sugestão de vínculo entre o catálogo daqui e o da agenda externa, pelo nome.
 * Só sugere — quem confirma é o dono, na tela de integração.
 */

/** Minúsculas, sem acento, sem pontuação, espaços únicos. */
export function normalizeForMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function firstWord(normalized: string): string {
  return normalized.split(' ')[0] ?? ''
}

/**
 * Para cada item local, o item externo de mesmo nome. Em ordem de confiança:
 * 1. nome igual (normalizado);
 * 2. um único externo que contém o nome local, ou está contido nele;
 * 3. (`matchFirstName`, para pessoas) um único externo com o mesmo primeiro nome.
 *
 * Ambiguidade nunca vira sugestão, e nenhum externo é sugerido duas vezes.
 * `taken`: externos já vinculados (não entram nas sugestões).
 */
export function suggestLinks(
  local: Array<{ id: string; name: string }>,
  external: Array<{ externalId: string; name: string }>,
  options: { matchFirstName?: boolean; taken?: Iterable<string> } = {}
): Map<string, string> {
  const used = new Set(options.taken ?? [])
  const result = new Map<string, string>()
  const externals = external.map((e) => ({ id: e.externalId, norm: normalizeForMatch(e.name) }))

  const strategies: Array<(localNorm: string, candidateNorm: string) => boolean> = [
    (a, b) => a === b,
    (a, b) => a.length >= 3 && b.length >= 3 && (b.includes(a) || a.includes(b)),
  ]
  if (options.matchFirstName) {
    strategies.push((a, b) => firstWord(a).length >= 3 && firstWord(a) === firstWord(b))
  }

  for (const matches of strategies) {
    for (const item of local) {
      if (result.has(item.id)) continue
      const norm = normalizeForMatch(item.name)
      if (!norm) continue
      const candidates = externals.filter((e) => !used.has(e.id) && matches(norm, e.norm))
      if (candidates.length === 1) {
        result.set(item.id, candidates[0].id)
        used.add(candidates[0].id)
      }
    }
  }
  return result
}
