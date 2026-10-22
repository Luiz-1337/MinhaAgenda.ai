/**
 * Onde o dono do salão consegue o token da Belasis (documentação oficial,
 * https://belasis-api.readme.io/reference/autenticação): Configurações → API →
 * "Gerar token" (ou "Visualizar Chave", se já gerou). A API precisa do adicional
 * ativo na conta.
 */
export const BELASIS_LINKS = {
  apiSettings: "https://belasis.app/settings/api",
  apiAddon: "https://belasis.app/subscription/addons/addon_id=2601271",
} as const

/** Todo token da Belasis começa assim — checado antes de ir à API. */
export const BELASIS_TOKEN_PREFIX = "bpk_"
