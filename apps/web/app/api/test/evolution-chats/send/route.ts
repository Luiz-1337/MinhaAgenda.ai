/**
 * POST: envia mensagem de texto para um JID (tela de teste Evolution).
 * Body: { instanceName: string, remoteJid: string, text: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendTestMessage } from '@/lib/services/evolution-instance.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { instanceName?: string; remoteJid?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Body JSON inválido' },
      { status: 400 }
    );
  }

  const { instanceName, remoteJid, text } = body;
  if (!instanceName || !remoteJid || text == null || String(text).trim() === '') {
    return NextResponse.json(
      { ok: false, error: 'instanceName, remoteJid e text são obrigatórios' },
      { status: 400 }
    );
  }

  const textTrimmed = String(text).trim();

  // Fire-and-forget: Evolution API em grupos pode demorar >60s ou travar. Respondemos logo e enviamos em background.
  sendTestMessage(instanceName, remoteJid, textTrimmed)
    .then(({ messageId }) => {
      logger.info({ instanceName, remoteJid, messageId }, 'Evolution test message sent (background)');
    })
    .catch((error) => {
      logger.error({ err: error, instanceName, remoteJid }, 'Evolution test send failed (background)');
    });

  return NextResponse.json({
    ok: true,
    messageId: 'pending',
    note: 'Mensagem em envio. Em grupos a Evolution API pode demorar — atualize a lista de mensagens em alguns segundos.',
  });
}
