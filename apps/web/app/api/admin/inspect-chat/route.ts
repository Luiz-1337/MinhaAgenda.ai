/**
 * API Endpoint para inspecionar detalhes de um chat
 * Uso: GET /api/admin/inspect-chat?chatId=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, sql } from '@repo/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const chatId = searchParams.get('chatId');

        if (!chatId) {
            return NextResponse.json(
                { error: 'Missing chatId param' },
                { status: 400 }
            );
        }

        // Query simplificada para debug
        const result = await db.execute(sql`
      SELECT * FROM chats WHERE id = ${chatId}
    `);

        if (result.length === 0) {
            return NextResponse.json({ found: false, message: 'Chat not found' });
        }

        return NextResponse.json({
            found: true,
            data: result[0],
        });
    } catch (error) {
        logger.error({ err: error }, 'Error inspecting chat');
        return NextResponse.json(
            { error: 'Failed to inspect chat', details: String(error) },
            { status: 500 }
        );
    }
}
