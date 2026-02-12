import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, agents, salons, eq } from '@repo/db';
import { hasSalonPermission } from '@/lib/services/permissions.service';
import { getInstanceStatus, mapEvolutionStatusToAgentStatus } from '@/lib/services/evolution-instance.service';
import { logger } from '@/lib/logger';

/**
 * GET /api/agents/[agentId]/whatsapp/status
 *
 * Gets WhatsApp connection status for an agent
 *
 * Returns array of connected numbers (for backward compatibility with frontend)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Get agent
    // Get agent
    const [agent] = await db
      .select({
        id: agents.id,
        salonId: agents.salonId,
        whatsappNumber: agents.whatsappNumber,
        whatsappStatus: agents.whatsappStatus,
        whatsappConnectedAt: agents.whatsappConnectedAt,
        whatsappVerifiedAt: agents.whatsappVerifiedAt,
      })
      .from(agents)
      .where(eq(agents.id, agentId));

    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    // Check salon permission
    const hasAccess = await hasSalonPermission(agent.salonId, user.id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Acesso negado a este salão' }, { status: 403 });
    }

    // Get salon to check Evolution instance
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, agent.salonId),
      columns: {
        evolutionInstanceName: true,
        evolutionConnectionStatus: true,
      },
    });

    // If no Evolution instance configured, return empty array
    if (!salon?.evolutionInstanceName) {
      return NextResponse.json({ numbers: [] });
    }

    // Get real-time status from Evolution API
    let currentStatus: 'verified' | 'pending_verification' | 'verifying' | 'failed' = 'pending_verification';

    try {
      const evolutionStatus = await getInstanceStatus(salon.evolutionInstanceName);
      currentStatus = mapEvolutionStatusToAgentStatus(evolutionStatus);

      logger.debug(
        {
          agentId,
          instanceName: salon.evolutionInstanceName,
          evolutionStatus,
          mappedStatus: currentStatus,
        },
        'Retrieved WhatsApp status from Evolution API'
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          agentId,
          instanceName: salon.evolutionInstanceName,
        },
        'Failed to get Evolution API status, using database status'
      );

      // Fallback to database status
      currentStatus = mapDatabaseStatus(agent.whatsappStatus);
    }

    // Return array for backward compatibility with frontend
    const numbers = agent.whatsappNumber
      ? [
        {
          phoneNumber: agent.whatsappNumber,
          status: currentStatus,
          connectedAt: agent.whatsappConnectedAt?.toISOString() ?? '',
          ...(agent.whatsappVerifiedAt
            ? { verifiedAt: agent.whatsappVerifiedAt.toISOString() }
            : {}),
        },
      ]
      : [];

    return NextResponse.json({ numbers });
  } catch (err) {
    logger.error({ err, agentId: (await params).agentId }, 'Error getting WhatsApp status');

    const msg =
      err instanceof Error
        ? err.message
        : 'Ocorreu um erro ao buscar status. Tente novamente.';

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Map database status to API status (fallback)
 */
function mapDatabaseStatus(
  s: string | null
): 'verified' | 'pending_verification' | 'verifying' | 'failed' {
  if (!s) return 'pending_verification';

  const v = s.toLowerCase();
  if (['verified', 'pending_verification', 'verifying', 'failed'].includes(v)) {
    return v as 'verified' | 'pending_verification' | 'verifying' | 'failed';
  }

  return 'failed';
}
