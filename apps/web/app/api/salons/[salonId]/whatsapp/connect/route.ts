import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, salons } from '@repo/db';
import { eq } from 'drizzle-orm';
import { hasSalonPermission } from '@/lib/services/permissions.service';
import {
  getOrCreateInstance,
  connectInstance,
  restartInstance,
  setInstanceWebhook,
} from '@/lib/services/evolution-instance.service';
import { checkRateLimit } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * POST /api/salons/[salonId]/whatsapp/connect
 *
 * Connects WhatsApp to salon using Evolution API
 *
 * Flow:
 * 1. Get or create Evolution API instance for the salon
 * 2. If not connected, generate QR code
 * 3. Return QR code for frontend to display
 * 4. User scans QR code with their phone
 * 5. Webhook will update connection status when connected
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ salonId: string }> }
) {
  try {
    const { salonId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Check if salon exists
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, name: true },
    });

    if (!salon) {
      return NextResponse.json(
        { success: false, error: 'Salão não encontrado' },
        { status: 404 }
      );
    }

    // Check salon permission
    const hasAccess = await hasSalonPermission(salonId, user.id);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado a este salão' },
        { status: 403 }
      );
    }

    // Rate limiting
    try {
      const rl = await checkRateLimit(`whatsapp:connect:${user.id}`, 5, 60);
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, error: 'Muitas tentativas. Aguarde um minuto.' },
          { status: 429 }
        );
      }
    } catch {
      // Redis failed: proceed without rate limit
    }

    // Check if user wants to force reconnect (get new QR even when already connected)
    const body = await req.json().catch(() => ({}));
    const forceReconnect = body?.reconnect === true;

    // Get or create Evolution instance for salon
    logger.info({ salonId, salonName: salon.name }, 'Creating Evolution API instance');

    const instance = await getOrCreateInstance(salonId);

    // If already connected and not forcing reconnect, return success
    if (instance.status === 'connected' && !forceReconnect) {
      return NextResponse.json({
        success: true,
        status: 'connected',
        message: 'WhatsApp já está conectado',
      });
    }

    // Force reconnect: disconnect first, then restart to get fresh QR
    if (forceReconnect && instance.status === 'connected') {
      const { disconnectInstance } = await import('@/lib/services/evolution-instance.service');
      logger.info({ instanceName: instance.instanceName, salonId }, 'Force reconnect: disconnecting first');
      try {
        await disconnectInstance(instance.instanceName);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await restartInstance(instance.instanceName);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        // Clear qrcode so we fetch fresh one below
        instance.qrcode = undefined;
      } catch (err) {
        logger.warn({ err }, 'Disconnect/restart failed during force reconnect, continuing');
      }
    }

    // If instance is closed, restart it first to get fresh QR
    if (instance.status === 'closed') {
      logger.info(
        { instanceName: instance.instanceName, salonId },
        'Instance closed, restarting to get fresh QR code'
      );
      await restartInstance(instance.instanceName);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    // Garantir webhook configurado antes de devolver o QR (para receber connection.update ao escanear)
    await setInstanceWebhook(instance.instanceName).catch((err) => {
      logger.warn({ err, instanceName: instance.instanceName }, 'Webhook set failed (continuing)');
    });

    // Get QR code (either from instance creation or fetch it)
    let qrcode = instance.qrcode;

    // If QR code not included in instance creation, fetch it
    if (!qrcode) {
      logger.info(
        { instanceName: instance.instanceName, salonId },
        'Fetching QR code for WhatsApp connection'
      );
      const result = await connectInstance(instance.instanceName);
      qrcode = result.qrcode;
    }

    logger.info({ salonId, salonName: salon.name }, 'QR code ready');

    return NextResponse.json({
      success: true,
      status: 'connecting',
      qrcode, // Base64 QR code for frontend to display
      message: 'Escaneie o QR code com seu WhatsApp para conectar',
      instructions: [
        '1. Abra o WhatsApp no seu celular',
        '2. Toque em Mais opções (⋮) > Aparelhos conectados',
        '3. Toque em Conectar um aparelho',
        '4. Aponte seu celular para esta tela para escanear o código QR',
      ],
    });
  } catch (err) {
    logger.error({ err, salonId: (await params).salonId }, 'Error connecting WhatsApp');

    const msg =
      err instanceof Error
        ? err.message
        : 'Ocorreu um erro ao conectar WhatsApp. Tente novamente.';

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
