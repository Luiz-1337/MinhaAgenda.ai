import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, agents, salons, eq } from '@repo/db';
import { hasSalonPermission } from '@/lib/services/permissions.service';
import { disconnectInstance } from '@/lib/services/evolution-instance.service';
import { checkRateLimit } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/agents/[agentId]/whatsapp/disconnect
 *
 * Disconnects WhatsApp from agent using Evolution API
 *
 * This will:
 * 1. Disconnect the Evolution instance from WhatsApp
 * 2. Clear agent WhatsApp data
 * 3. Update status to failed
 */
export async function DELETE(
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
      columns: {
        id: true,
        salonId: true,
        whatsappNumber: true,
      },
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
      const rl = await checkRateLimit(`whatsapp:disconnect:${user.id}`, 5, 60);
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, error: 'Muitas tentativas. Aguarde um minuto.' },
          { status: 429 }
        );
      }
    } catch {
      // Redis failed: proceed without rate limit
    }

    // Get salon to find Evolution instance
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, agent.salonId),
      columns: {
        evolutionInstanceName: true,
      },
    });

    // Disconnect Evolution instance if exists
    if (salon?.evolutionInstanceName) {
      try {
        logger.info(
          { instanceName: salon.evolutionInstanceName, agentId },
          'Disconnecting Evolution API instance'
        );

        await disconnectInstance(salon.evolutionInstanceName);

        logger.info(
          { instanceName: salon.evolutionInstanceName, agentId },
          'Evolution API instance disconnected successfully'
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            instanceName: salon.evolutionInstanceName,
            agentId,
          },
          'Failed to disconnect Evolution instance (continuing anyway)'
        );
        // Continue even if disconnect fails - we'll clear the database anyway
      }
    }

    // Clear agent WhatsApp fields
    await db
      .update(agents)
      .set({
        whatsappNumber: null,
        whatsappStatus: 'failed',
        whatsappConnectedAt: null,
        whatsappVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    logger.info({ agentId, salonId: agent.salonId }, 'WhatsApp disconnected from agent');

    return NextResponse.json({
      success: true,
      message: 'WhatsApp desconectado com sucesso',
    });
  } catch (err) {
    logger.error({ err, agentId: (await params).agentId }, 'Error disconnecting WhatsApp');

    const msg =
      err instanceof Error
        ? err.message
        : 'Ocorreu um erro ao desconectar. Tente novamente.';

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
