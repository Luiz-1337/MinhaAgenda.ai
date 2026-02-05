import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, agents, salons } from '@repo/db';
import { eq } from 'drizzle-orm';
import { hasSalonPermission } from '@/lib/services/permissions.service';
import { disconnectInstance } from '@/lib/services/evolution-instance.service';
import { checkRateLimit } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/salons/[salonId]/whatsapp/disconnect
 *
 * Disconnects WhatsApp from salon using Evolution API
 *
 * This will:
 * 1. Disconnect the Evolution instance from WhatsApp
 * 2. Clear all agents WhatsApp data for this salon
 * 3. Update status to failed
 */
export async function DELETE(
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
      columns: {
        id: true,
        evolutionInstanceName: true,
      },
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

    // Disconnect Evolution instance if exists
    if (salon.evolutionInstanceName) {
      try {
        logger.info(
          { instanceName: salon.evolutionInstanceName, salonId },
          'Disconnecting Evolution API instance'
        );

        await disconnectInstance(salon.evolutionInstanceName);

        logger.info(
          { instanceName: salon.evolutionInstanceName, salonId },
          'Evolution API instance disconnected successfully'
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            instanceName: salon.evolutionInstanceName,
            salonId,
          },
          'Failed to disconnect Evolution instance (continuing anyway)'
        );
        // Continue even if disconnect fails - we'll clear the database anyway
      }
    }

    // Clear WhatsApp fields from ALL agents of the salon
    try {
      const result = await db
        .update(agents)
        .set({
          whatsappNumber: null,
          whatsappStatus: 'failed',
          whatsappConnectedAt: null,
          whatsappVerifiedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(agents.salonId, salonId))
        .returning({ id: agents.id });

      logger.info(
        { salonId, agentsUpdated: result.length },
        'WhatsApp disconnected from all salon agents'
      );
    } catch (dbError) {
      logger.error({ err: dbError, salonId }, 'Database error while disconnecting WhatsApp');
      throw dbError;
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp desconectado com sucesso',
    });
  } catch (err) {
    logger.error({ err, salonId: (await params).salonId }, 'Error disconnecting WhatsApp');

    const msg =
      err instanceof Error
        ? err.message
        : 'Ocorreu um erro ao desconectar. Tente novamente.';

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
