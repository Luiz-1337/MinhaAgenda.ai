/**
 * Download de mídia recebida via WhatsApp Cloud API (Meta).
 *
 * A Cloud API entrega a mídia como um MEDIA ID (não uma URL). O download é em
 * 2 passos:
 *   1) GET /{media-id}            -> JSON com `url` (temporária) + `mime_type`
 *   2) GET {url} (com Bearer)     -> bytes (a URL exige o mesmo Authorization)
 *
 * Best-effort: nunca lança — retorna null em falha (o worker degrada como já
 * faz no caminho Evolution). Imports relativos (este módulo entra no grafo do
 * worker via media-processor; o alias @/ não resolve sob tsx).
 */

import { logger } from '../../../infra/logger';

export async function downloadCloudMedia(
  mediaId: string,
  opts: { token?: string; graphVersion?: string } = {},
): Promise<{ buffer: Buffer; mimetype: string } | null> {
  const token = opts.token ?? process.env.WHATSAPP_CLOUD_TOKEN;
  const version = opts.graphVersion ?? process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0';

  if (!token) {
    logger.error({ mediaId }, 'downloadCloudMedia: WHATSAPP_CLOUD_TOKEN ausente');
    return null;
  }

  try {
    // Passo 1: metadados (URL temporária + mime_type)
    const metaRes = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      logger.error({ mediaId, status: metaRes.status }, 'downloadCloudMedia: falha ao obter metadados da mídia');
      return null;
    }
    const meta = (await metaRes.json().catch(() => undefined)) as
      | { url?: string; mime_type?: string }
      | undefined;
    if (!meta?.url) {
      logger.error({ mediaId }, 'downloadCloudMedia: metadados sem url');
      return null;
    }

    // Passo 2: baixar os bytes (a URL temporária exige o mesmo Bearer)
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) {
      logger.error({ mediaId, status: binRes.status }, 'downloadCloudMedia: falha ao baixar os bytes');
      return null;
    }

    const buffer = Buffer.from(await binRes.arrayBuffer());
    const mimetype = meta.mime_type ?? 'application/octet-stream';
    logger.info({ mediaId, sizeBytes: buffer.length, mimetype }, 'Mídia Cloud baixada');
    return { buffer, mimetype };
  } catch (err) {
    logger.error({ err, mediaId }, 'downloadCloudMedia: erro inesperado');
    return null;
  }
}
