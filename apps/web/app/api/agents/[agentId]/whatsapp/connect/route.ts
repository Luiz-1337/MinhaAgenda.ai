import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, agents, eq } from '@repo/db';
import { hasSalonPermission } from '@/lib/services/permissions.service';
import {
  getOrCreateInstance,
  getOrCreateAgentInstance,
  connectInstance,
  restartInstance,
} from '@/lib/services/evolution/evolution-instance.service';
import { checkRateLimit } from '@/lib/infra/redis';
import { logger } from '@/lib/infra/logger';
import { db as dbFull, salons, profiles, eq as eqFull } from '@repo/db';
import type { PlanTier } from '@/lib/types/salon';

/**
 * POST /api/agents/[agentId]/whatsapp/connect
 *
 * Connects WhatsApp to agent using Evolution API
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
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
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

    // Get agent
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { id: true, salonId: true, name: true, whatsappNumber: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agente não encontrado' },
        { status: 404 }
      );
    }

    // Check salon permission
    const hasAccess = await hasSalonPermission(agent.salonId, user.id);
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

    // Determine plan tier to decide instance type
    const salon = await dbFull.query.salons.findFirst({
      where: eqFull(salons.id, agent.salonId),
      columns: { ownerId: true },
    });

    let planTier: PlanTier = 'SOLO';
    if (salon) {
      const ownerProfile = await dbFull.query.profiles.findFirst({
        where: eqFull(profiles.id, salon.ownerId),
        columns: { tier: true },
      });
      planTier = (ownerProfile?.tier as PlanTier) || 'SOLO';
    }

    // PRO/Enterprise: per-agent instance; SOLO: salon-level instance
    logger.info(
      { salonId: agent.salonId, agentId, planTier },
      'Creating Evolution API instance'
    );

    const instance = planTier === 'SOLO'
      ? await getOrCreateInstance(agent.salonId)
      : await getOrCreateAgentInstance(agentId);

    // If already connected, return success
    if (instance.status === 'connected') {
      return NextResponse.json({
        success: true,
        status: 'connected',
        message: 'WhatsApp já está conectado',
      });
    }

    // If instance is closed, restart it first to get fresh QR
    if (instance.status === 'closed') {
      logger.info(
        { instanceName: instance.instanceName, salonId: agent.salonId },
        'Instance closed, restarting to get fresh QR code'
      );
      await restartInstance(instance.instanceName);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    // Generate QR code for connection
    logger.info(
      { instanceName: instance.instanceName, salonId: agent.salonId },
      'Generating QR code for WhatsApp connection'
    );

    const { qrcode } = await connectInstance(instance.instanceName);

    // Update agent status to connecting
    await db
      .update(agents)
      .set({
        whatsappStatus: 'verifying',
        whatsappConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    logger.info(
      { agentId, salonId: agent.salonId },
      'QR code generated successfully'
    );

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
    logger.error({ err, agentId: (await params).agentId }, 'Error connecting WhatsApp');

    const msg =
      err instanceof Error
        ? err.message
        : 'Ocorreu um erro ao conectar WhatsApp. Tente novamente.';

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
