/**
 * Tabela ÚNICA de tipos de mensagem da WhatsApp Cloud API.
 *
 * Módulo com ZERO imports de propósito: entra no grafo do worker (que roda via
 * tsx e não resolve o alias `@/`) e é onde a tabela fica testável sem banco.
 *
 * Por que existir: o webhook tinha DUAS listas de tipos — o `switch` do
 * extractContent e o Set `ECHO_CONTENT_TYPES` — e adicionar um tipo exigia
 * lembrar dos dois. Aqui os dois gates derivam da MESMA tabela, então
 * acrescentar um tipo atualiza ambos por construção. (Exatamente o problema que
 * duplicação causou no formatPreviewTime, onde as cópias divergiram.)
 *
 * O que motivou: `[tipo reaction não suportado]` e `[tipo unsupported não
 * suportado]` estavam gravados em produção como mensagem DO CLIENTE e iam, como
 * texto, para o prompt da IA. Um cliente reagindo com 👍 fazia a IA responder a
 * essa string.
 */

export type CloudMediaType = 'image' | 'audio' | 'video' | 'document';

/** Shape do inbound da Cloud API, no que a gente consome. */
export interface CloudInboundMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; caption?: string; filename?: string };
  sticker?: { id?: string; animated?: boolean };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  reaction?: { message_id?: string; emoji?: string };
  order?: { product_items?: unknown[] };
  system?: { body?: string; type?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  /** Presente SÓ quando a conversa nasceu de um clique em anúncio (CTWA) ou post. */
  referral?: {
    source_type?: string;
    source_id?: string;
    source_url?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    ctwa_clid?: string;
  };
}

/**
 * Origem de um lead que chegou por anúncio (Click-to-WhatsApp) ou post.
 *
 * A Meta manda isso em `messages[0].referral` na PRIMEIRA mensagem da conversa —
 * junto com o texto pré-preenchido "Olá! Posso ter mais informações sobre isso?".
 * O "isso" é o anúncio: sem estes campos a IA não tem como saber a que a cliente
 * se refere, e abre a conversa perguntando exatamente o que o anúncio já disse.
 * Foi o que aconteceu com os dois primeiros leads pagos (30/07), e os dois
 * abandonaram depois de receber a resposta.
 *
 * `ctwaClid` não serve à conversa: é a chave de atribuição para devolver a
 * conversão à Meta via Conversions API. Guardado agora porque só chega aqui, uma
 * vez, e não há como recuperá-lo depois.
 */
export interface AdReferral {
  /** 'ad' quando veio de anúncio; 'post' quando veio de publicação orgânica. */
  sourceType?: string;
  /** ID do anúncio/post na Meta — junta com o Gerenciador de Anúncios. */
  sourceId?: string;
  sourceUrl?: string;
  /** Título do anúncio (o gancho que a cliente clicou). */
  headline?: string;
  /** Corpo do anúncio. */
  body?: string;
  mediaType?: string;
  /** Click ID para atribuição de conversão (CAPI). Não entra no prompt. */
  ctwaClid?: string;
}

/**
 * Teto de caracteres para os textos do anúncio que entram no system prompt.
 *
 * O corpo de um anúncio pode ter parágrafos, e ele passaria a ser injetado em
 * TODA mensagem da conversa — o custo de token é recorrente, não único. O gancho
 * está sempre nas primeiras linhas.
 */
const AD_TEXT_MAX = 300;

function trimAdText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length === 0) return undefined;
  return clean.length > AD_TEXT_MAX ? `${clean.slice(0, AD_TEXT_MAX)}…` : clean;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}

/**
 * Extrai a origem de anúncio de uma mensagem inbound. Null quando a conversa não
 * nasceu de anúncio — o caso da esmagadora maioria das mensagens.
 *
 * Devolve null também quando o objeto veio vazio ou sem nenhum campo útil, para
 * não gravar `{}` no banco e não injetar um bloco oco no prompt.
 */
export function extractAdReferral(msg: CloudInboundMessage): AdReferral | null {
  const r = msg.referral;
  if (!r || typeof r !== 'object') return null;

  const referral: AdReferral = {
    sourceType: asString(r.source_type),
    sourceId: asString(r.source_id),
    sourceUrl: asString(r.source_url),
    headline: trimAdText(r.headline),
    body: trimAdText(r.body),
    mediaType: asString(r.media_type),
    ctwaClid: asString(r.ctwa_clid),
  };

  const temAlgo = Object.values(referral).some((v) => v !== undefined);
  return temAlgo ? referral : null;
}

/**
 * Bloco de contexto do anúncio para o system prompt. String vazia quando não há
 * anúncio, para concatenar sem `if` no template (mesma convenção dos outros
 * blocos do prompt builder).
 *
 * Vive aqui, e não no prompt builder, porque este módulo é o que o worker
 * importa sem passar pelo alias `@/` — e porque a tabela de campos e o texto que
 * os apresenta divergem se ficarem em arquivos diferentes.
 *
 * A instrução final é o ponto todo desta mudança: sem ela o modelo recebe o
 * contexto e ainda assim pergunta "sobre qual serviço você quer saber?", porque
 * o FLUXO DE AGENDAMENTO manda perguntar isso no passo 1.
 */
export function formatAdReferralText(referral: AdReferral | null | undefined): string {
  if (!referral) return '';

  const origem = referral.sourceType === 'post' ? 'uma publicação' : 'um anúncio';
  const linhas: string[] = [`- A cliente chegou clicando em ${origem} do salão.`];
  if (referral.headline) linhas.push(`- Título do anúncio: "${referral.headline}"`);
  if (referral.body) linhas.push(`- Texto do anúncio: "${referral.body}"`);

  const temTexto = !!(referral.headline || referral.body);
  linhas.push(
    temTexto
      ? '- REGRA (tem PRECEDÊNCIA sobre o passo 1 do FLUXO DE AGENDAMENTO): a primeira mensagem dela ("Posso ter mais informações sobre isso?") é texto PRONTO, preenchido pelo próprio WhatsApp ao clicar — não foi ela que escolheu essas palavras. O "isso" é o anúncio acima. É PROIBIDO responder com "sobre qual serviço você quer saber mais?" ou qualquer variação de pergunta em aberto: ela já disse a que veio ao clicar. Abra falando do que o anúncio oferece e faça UMA pergunta que avance o agendamento (ex.: confirmar o serviço do anúncio, ou já perguntar o dia).'
      : '- REGRA: ela veio de anúncio, mas o texto do anúncio não chegou até aqui. Trate como interesse inicial e pergunte de forma acolhedora o que ela procura.'
  );

  return `\n\nORIGEM DA CONVERSA (contexto privado — nunca mencione "anúncio" como jargão técnico):\n${linhas.join('\n')}`;
}

export interface CloudContent {
  /** Texto que vai para o histórico e para o prompt da IA. */
  body: string;
  hasMedia: boolean;
  mediaType?: CloudMediaType;
  /** Id da mídia na Meta, para o worker baixar. */
  mediaId?: string;
  /**
   * Se esta mensagem deve ACORDAR a IA. Falso em reação e em aviso de sistema:
   * eles entram no histórico (o painel mostra, o contexto registra) mas não são
   * um pedido a responder — a IA respondendo a um 👍 é ruído para o cliente.
   */
  wakeAI: boolean;
  /** Falso quando o tipo não está na tabela — sinaliza campo novo da Meta. */
  known: boolean;
}

/**
 * Tipos que carregam CONTEÚDO de verdade e por isso viram bolha no histórico.
 * Usado também no gate do eco (a fala da atendente pelo app do celular).
 * Fora daqui: reaction e system, que disparam efeito mas não são fala; e
 * revoke/edit, que só existem no eco e não devem criar mensagem nova.
 */
const CONTENT_TYPES = new Set([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'order',
  'button',
  'interactive',
  'unsupported',
]);

export function isCloudContentType(type: string | undefined): boolean {
  return !!type && CONTENT_TYPES.has(type);
}

/**
 * True quando o body é um rótulo que NÓS geramos (`[imagem]`, `[IMAGE]`,
 * `[figurinha]`, `[localização compartilhada: …]`) e não uma fala do cliente.
 *
 * O worker usa isso para decidir se manda o body ao Vision como legenda ou se
 * usa a instrução própria. Antes ele comparava com o literal `"[IMAGE]"` da
 * Evolution, então toda imagem vinda do Cloud (que grava `[imagem]`) mandava a
 * string do rótulo ao Vision como se fosse legenda do cliente.
 *
 * Trade-off aceito: um cliente que mande literalmente "[oi]" junto de uma imagem
 * perde a legenda. Raro e de dano baixo, contra o benefício de não precisar
 * manter uma lista de rótulos em dois formatos.
 */
export function isPlaceholderBody(body: string | null | undefined): boolean {
  if (!body) return false;
  return /^\[[^\]]*\]$/.test(body.trim());
}

/** Alvo de uma reação: a mensagem reagida e o emoji (vazio = reação removida). */
export function getReactionTarget(
  msg: CloudInboundMessage,
): { messageId: string; emoji: string } | null {
  if (msg.type !== 'reaction') return null;
  const messageId = msg.reaction?.message_id;
  if (!messageId) return null;
  return { messageId, emoji: msg.reaction?.emoji ?? '' };
}

/** Limite de trecho da mensagem original citado no rótulo da reação. */
const REACTION_QUOTE_MAX = 40;

/**
 * Rótulo da reação, citando a mensagem original quando ela é conhecida — sem o
 * trecho, "o cliente reagiu com 👍" não diz a QUÊ, e a IA não tem como usar isso.
 */
export function buildReactionLabel(emoji: string, originalContent?: string | null): string {
  const quote = originalContent?.trim().replace(/\s+/g, ' ');
  const trecho =
    quote && !isPlaceholderBody(quote)
      ? ` a "${quote.length > REACTION_QUOTE_MAX ? `${quote.slice(0, REACTION_QUOTE_MAX)}…` : quote}"`
      : '';

  if (!emoji) return `[o cliente removeu a reação${trecho}]`;
  return `[o cliente reagiu com ${emoji}${trecho}]`;
}

/**
 * Extrai o conteúdo de uma mensagem inbound da Cloud API.
 *
 * Convenção de rótulo: pt-BR minúsculo entre colchetes. Difere do
 * `[LOCATION]`/`[CONTACT]` do caminho Evolution (lib/schemas/evolution.ts) e é
 * intencional — os rótulos aparecem no painel e no prompt, os dois em pt-BR. Quem
 * consome não depende do formato: usa isPlaceholderBody.
 */
export function extractCloudContent(msg: CloudInboundMessage): CloudContent {
  switch (msg.type) {
    case 'text':
      return { body: msg.text?.body ?? '', hasMedia: false, wakeAI: true, known: true };

    case 'image':
      return {
        body: msg.image?.caption ?? '[imagem]',
        hasMedia: true,
        mediaType: 'image',
        mediaId: msg.image?.id,
        wakeAI: true,
        known: true,
      };

    case 'video':
      return {
        body: msg.video?.caption ?? '[vídeo]',
        hasMedia: true,
        mediaType: 'video',
        mediaId: msg.video?.id,
        wakeAI: true,
        known: true,
      };

    case 'audio':
      return {
        body: '[áudio]',
        hasMedia: true,
        mediaType: 'audio',
        mediaId: msg.audio?.id,
        wakeAI: true,
        known: true,
      };

    case 'document':
      return {
        body: msg.document?.caption ?? msg.document?.filename ?? '[documento]',
        hasMedia: true,
        mediaType: 'document',
        mediaId: msg.document?.id,
        wakeAI: true,
        known: true,
      };

    // Figurinha NÃO é tratada como mídia de propósito: mandá-la ao Vision custa
    // tempo e dinheiro para analisar um webp de emoji, e o pipeline de upload
    // gravaria com extensão errada (extensionFor força "jpg" para imagem).
    case 'sticker':
      return { body: '[figurinha]', hasMedia: false, wakeAI: true, known: true };

    case 'location': {
      const nome = msg.location?.name ?? msg.location?.address;
      return {
        body: nome ? `[localização compartilhada: ${nome}]` : '[localização compartilhada]',
        hasMedia: false,
        wakeAI: true,
        known: true,
      };
    }

    case 'contacts': {
      const lista = msg.contacts ?? [];
      if (lista.length === 1) {
        const nome = lista[0]?.name?.formatted_name;
        return {
          body: nome ? `[contato compartilhado: ${nome}]` : '[contato compartilhado]',
          hasMedia: false,
          wakeAI: true,
          known: true,
        };
      }
      return {
        body: `[${lista.length} contatos compartilhados]`,
        hasMedia: false,
        wakeAI: true,
        known: true,
      };
    }

    // Reação não é pedido: entra no histórico, mas não acorda a IA. O rótulo com
    // o trecho da mensagem original é montado por quem tem acesso ao banco
    // (buildReactionLabel), porque exige resolver o wamid.
    case 'reaction':
      return {
        body: buildReactionLabel(msg.reaction?.emoji ?? ''),
        hasMedia: false,
        wakeAI: false,
        known: true,
      };

    case 'order': {
      const itens = msg.order?.product_items?.length ?? 0;
      return {
        body: itens > 0 ? `[pedido do catálogo: ${itens} ${itens === 1 ? 'item' : 'itens'}]` : '[pedido do catálogo]',
        hasMedia: false,
        wakeAI: true,
        known: true,
      };
    }

    // Aviso do próprio WhatsApp (ex.: cliente trocou de número). Não é fala do
    // cliente, então não acorda a IA.
    case 'system':
      return {
        body: msg.system?.body ? `[aviso do WhatsApp: ${msg.system.body}]` : '[aviso do WhatsApp]',
        hasMedia: false,
        wakeAI: false,
        known: true,
      };

    case 'button':
      return { body: msg.button?.text ?? '', hasMedia: false, wakeAI: true, known: true };

    case 'interactive':
      return {
        body: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '',
        hasMedia: false,
        wakeAI: true,
        known: true,
      };

    // A Meta manda 'unsupported' quando o cliente envia algo que ela mesma não
    // entrega (ex.: enquete). Acorda a IA para ela pedir reenvio — silêncio numa
    // mensagem real é pior que uma resposta genérica.
    case 'unsupported':
      return {
        body: '[o cliente enviou algo que não conseguimos abrir]',
        hasMedia: false,
        wakeAI: true,
        known: true,
      };

    default:
      return {
        body: '[mensagem não reconhecida]',
        hasMedia: false,
        wakeAI: false,
        known: false,
      };
  }
}
