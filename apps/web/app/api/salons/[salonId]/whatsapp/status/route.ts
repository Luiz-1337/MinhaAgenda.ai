import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, agents, salons } from '@repo/db';
import { eq } from 'drizzle-orm';
import { hasSalonPermission } from '@/lib/services/permissions.service';
import { getInstanceStatus, getConnectedPhoneNumber, mapEvolutionStatusToAgentStatus } from '@/lib/services/evolution-instance.service';
import { logger } from '@/lib/logger';

/**
 * GET /api/salons/[salonId]/whatsapp/status
 *
 * Gets WhatsApp connection status for a salon
 *
 * Returns array of connected numbers (for backward compatibility with frontend)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ salonId: string }> }
) {
  try {
    const { salonId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Check if salon exists
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: {
        id: true,
        evolutionInstanceName: true,
        evolutionConnectionStatus: true,
      },
    });

    if (!salon) {
      return NextResponse.json({ error: 'Salão não encontrado' }, { status: 404 });
    }

    // Check salon permission
    const hasAccess = await hasSalonPermission(salonId, user.id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Acesso negado a este salão' }, { status: 403 });
    }

    // If no Evolution instance configured, return empty array
    if (!salon.evolutionInstanceName) {
      return NextResponse.json({ numbers: [] });
    }

    // Get any agent from salon to retrieve WhatsApp number (all should have the same)
    const agent = await db.query.agents.findFirst({
      where: eq(agents.salonId, salonId),
      columns: {
        whatsappNumber: true,
        whatsappStatus: true,
        whatsappConnectedAt: true,
      },
    });

    // Get real-time status from Evolution API
    let currentStatus: 'verified' | 'pending_verification' | 'verifying' | 'failed' = 'pending_verification';

    try {
      const evolutionStatus = await getInstanceStatus(salon.evolutionInstanceName);
      currentStatus = mapEvolutionStatusToAgentStatus(evolutionStatus);

      logger.debug(
        {
          salonId,
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
          salonId,
          instanceName: salon.evolutionInstanceName,
        },
        'Failed to get Evolution API status, using database status'
      );

      // Fallback to database status
      currentStatus = mapDatabaseStatus(agent?.whatsappStatus);
    }

    // Se Evolution conectada mas sem número no agente, tenta buscar da Evolution API
    let phoneNumber = agent?.whatsappNumber;
    if (currentStatus === 'verified' && salon.evolutionInstanceName && !phoneNumber) {
      try {
        const fetched = await getConnectedPhoneNumber(salon.evolutionInstanceName);
        if (fetched) {
          phoneNumber = fetched;
          // Atualiza o primeiro agente do salão para persistir o número
          const firstAgent = await db.query.agents.findFirst({
            where: eq(agents.salonId, salonId),
            columns: { id: true },
          });
          if (firstAgent) {
            await db
              .update(agents)
              .set({
                whatsappNumber: fetched,
                whatsappConnectedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(agents.id, firstAgent.id));
          }
        }
      } catch {
        // Ignora falha - número permanece vazio
      }
    }

    // Return array for backward compatibility with frontend
    const numbers =
      currentStatus === 'verified'
        ? [
            {
              phoneNumber: phoneNumber ?? 'Número conectado',
              status: currentStatus as 'verified',
              connectedAt: agent?.whatsappConnectedAt?.toISOString() ?? new Date().toISOString(),
            },
          ]
        : phoneNumber
          ? [
              {
                phoneNumber,
                status: currentStatus,
                connectedAt: agent?.whatsappConnectedAt?.toISOString() ?? '',
              },
            ]
          : [];

    return NextResponse.json({ numbers });
  } catch (err) {
    logger.error({ err, salonId: (await params).salonId }, 'Error getting WhatsApp status');

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
  s: string | null | undefined
): 'verified' | 'pending_verification' | 'verifying' | 'failed' {
  if (!s) return 'pending_verification';

  const v = s.toLowerCase();
  if (['verified', 'pending_verification', 'verifying', 'failed'].includes(v)) {
    return v as 'verified' | 'pending_verification' | 'verifying' | 'failed';
  }

  return 'failed';
}
