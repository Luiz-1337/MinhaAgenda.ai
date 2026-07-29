/**
 * Kill switch da Evolution API (WhatsApp por QR não-oficial).
 *
 * O serviço Evolution no Railway foi APAGADO — a URL responde 404 "Application
 * not found" até na raiz. A plataforma opera só com a WhatsApp Cloud API oficial.
 * Enquanto isso, o painel seguia chamando a Evolution a cada visita à tela de
 * Agentes, logando erro e, no caso do disconnect, gravando
 * whatsapp_status='failed' em TODOS os agentes do salão.
 *
 * Módulo à parte de propósito: `evolution-api.service.ts` arrasta o cliente HTTP,
 * e `getEvolutionClient()` LANÇA quando falta EVOLUTION_API_URL — então importar
 * dele só para ler uma flag reintroduziria a falha que este arquivo evita. Aqui
 * não há import nenhum.
 *
 * O código da Evolution NÃO foi removido: 8 dos 9 agentes em produção ainda estão
 * com messaging_provider='evolution', e o histórico de mensagens veio por ali.
 * Basta ligar a env para o caminho voltar.
 */

/** True só quando EVOLUTION_ENABLED === 'true'. O default é DESLIGADO. */
export function isEvolutionEnabled(): boolean {
  return process.env.EVOLUTION_ENABLED === "true"
}
