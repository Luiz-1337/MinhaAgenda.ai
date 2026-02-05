/**
 * GET: busca mensagens de um chat (Evolution API findMessages).
 * Query: instanceName, remoteJid, limit (opcional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInstanceMessages } from '@/lib/services/evolution-instance.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const instanceName = request.nextUrl.searchParams.get('instanceName');
  const remoteJid = request.nextUrl.searchParams.get('remoteJid');
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 100) : 50;

  if (!instanceName || !remoteJid) {
    return NextResponse.json(
      { ok: false, error: 'instanceName e remoteJid são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const messages = await getInstanceMessages(instanceName, decodeURIComponent(remoteJid), limit);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    logger.error({ err: error, instanceName, remoteJid }, 'Evolution test messages fetch failed');
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Erro ao buscar mensagens' },
      { status: 500 }
    );
  }
}
