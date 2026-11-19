/**
 * Preferência de grupos recolhidos da sidebar do salão. Fica num cookie (e não
 * em localStorage) para o layout ler no servidor e a página já nascer com os
 * grupos fechados — sem piscar no reload.
 *
 * Vive fora de `components/dashboard/sidebar.tsx` porque aquele arquivo é
 * "use client": o layout (Server Component) não consegue chamar funções dele.
 */
export const SIDEBAR_COLLAPSED_COOKIE = "sidebar_collapsed"

/** Ids dos grupos recolhidos, a partir do valor cru do cookie (separados por vírgula). */
export function parseCollapsedGroups(value: string | undefined): string[] {
  if (!value) return []
  return decodeURIComponent(value).split(",").filter(Boolean)
}
