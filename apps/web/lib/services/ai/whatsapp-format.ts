/**
 * Normalização de formatação para o WhatsApp.
 *
 * O WhatsApp usa *negrito* (um asterisco), não **negrito** (Markdown). Quando o
 * modelo emite Markdown, o cliente vê os asteriscos literais. Esta função
 * converte os casos comuns. Mantida isolada para ser testável sem carregar o
 * módulo pesado de geração de resposta.
 */
export function normalizeWhatsappFormatting(text: string): string {
  return text
    .replace(/\*\*+(.+?)\*\*+/g, "*$1*") // **negrito** / ***negrito*** -> *negrito*
    .replace(/^#{1,6}[ \t]+/gm, ""); // remove "### " de headings markdown
}
