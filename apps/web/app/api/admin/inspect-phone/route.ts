/**
 * API Endpoint para buscar clientes por telefone
 * Uso: GET /api/admin/inspect-phone?phone=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, sql } from '@repo/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const phone = searchParams.get('phone');

        if (!phone) {
            return NextResponse.json(
                { error: 'Missing phone param' },
                { status: 400 }
            );
        }

        // Busca clientes com este telefone (parcial ou exato)
        const result = await db.execute(sql`
      SELECT id, name, phone, created_at
      FROM customers
      WHERE phone LIKE ${'%' + phone + '%'}
    `);

        return NextResponse.json({
            found: result.length > 0,
            count: result.length,
            data: result,
        });
    } catch (error) {
        logger.error({ err: error }, 'Error inspecting phone');
        return NextResponse.json(
            { error: 'Failed to inspect phone', details: String(error) },
            { status: 500 }
        );
    }
}
