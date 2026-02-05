/**
 * API de teste: sincroniza todos os chats da Evolution API.
 * Uso: GET /api/test/evolution-chats
 * Não exposto no portal — apenas por URL.
 */

import { NextResponse } from 'next/server';
import { db, salons } from '@repo/db';
import { isNotNull } from 'drizzle-orm';
import { getInstanceChats, type EvolutionChat } from '@/lib/services/evolution-instance.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface EvolutionChatsInstance {
  salonId: string;
  salonName: string;
  instanceName: string;
  connectionStatus: string | null;
  chats: EvolutionChat[];
  error?: string;
}

export interface EvolutionChatsResponse {
  ok: boolean;
  instances: EvolutionChatsInstance[];
  syncedAt: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const salonsWithEvolution = await db.query.salons.findMany({
      where: isNotNull(salons.evolutionInstanceName),
      columns: {
        id: true,
        name: true,
        evolutionInstanceName: true,
        evolutionConnectionStatus: true,
      },
    });

    const instances: EvolutionChatsInstance[] = [];

    for (const salon of salonsWithEvolution) {
      const instanceName = salon.evolutionInstanceName!;
      const item: EvolutionChatsInstance = {
        salonId: salon.id,
        salonName: salon.name,
        instanceName,
        connectionStatus: salon.evolutionConnectionStatus,
        chats: [],
      };

      try {
        const chats = await getInstanceChats(instanceName);
        item.chats = chats;
        logger.info(
          { salonId: salon.id, instanceName, count: chats.length },
          'Evolution chats fetched for test sync'
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        item.error = message;
        logger.warn(
          { err, salonId: salon.id, instanceName },
          'Failed to fetch Evolution chats for instance'
        );
      }

      instances.push(item);
    }

    const response: EvolutionChatsResponse = {
      ok: true,
      instances,
      syncedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Evolution test sync failed');
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao sincronizar chats',
        instances: [],
        syncedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
