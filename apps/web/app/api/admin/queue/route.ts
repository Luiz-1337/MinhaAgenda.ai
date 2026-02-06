/**
 * API Endpoint para gerenciar a fila de mensagens
 * Uso: 
 * - GET /api/admin/queue - Ver estatísticas
 * - DELETE /api/admin/queue - Limpar jobs falhos
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMessageQueue, getQueueStats } from '@/lib/queues/message-queue';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const stats = await getQueueStats();
        const queue = getMessageQueue();

        // Pegar alguns jobs falhos para debug
        const failedJobs = await queue.getFailed(0, 5);
        const failedDetails = failedJobs.map(job => ({
            id: job.id,
            messageId: job.data.messageId,
            chatId: job.data.chatId,
            clientPhone: job.data.clientPhone,
            replyToJid: job.data.replyToJid,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
        }));

        return NextResponse.json({
            stats,
            failedJobs: failedDetails,
        });
    } catch (error) {
        logger.error({ err: error }, 'Error getting queue stats');
        return NextResponse.json(
            { error: 'Failed to get queue stats' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    try {
        const queue = getMessageQueue();

        // Limpar jobs falhos
        const failedJobs = await queue.getFailed();
        let cleared = 0;

        for (const job of failedJobs) {
            await job.remove();
            cleared++;
        }

        // Limpar jobs em espera (podem ter dados antigos)
        const waitingJobs = await queue.getWaiting();
        for (const job of waitingJobs) {
            await job.remove();
            cleared++;
        }

        logger.info({ cleared }, 'Queue jobs cleared');

        return NextResponse.json({
            success: true,
            cleared,
            message: `Cleared ${cleared} jobs from queue`,
        });
    } catch (error) {
        logger.error({ err: error }, 'Error clearing queue');
        return NextResponse.json(
            { error: 'Failed to clear queue' },
            { status: 500 }
        );
    }
}
