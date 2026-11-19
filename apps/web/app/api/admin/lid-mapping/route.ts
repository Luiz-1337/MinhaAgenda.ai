/**
 * API Endpoint para gerenciar mapeamentos LID → número
 * Uso: POST /api/admin/lid-mapping
 * Body: { lid: string, phone: string, instanceName: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { setManualLidMapping, removeLidMapping, resolveLidToPhone } from '@/lib/infra/redis';
import { logger } from '@/lib/infra/logger';
import { requireAdminRequest } from '@/lib/services/admin-auth.service';
import { logAdminAction } from '@/lib/services/admin-audit.service';

export async function POST(request: NextRequest) {
    const auth = await requireAdminRequest(request.headers);
    if ('response' in auth) return auth.response;

    try {
        const body = await request.json();
        const { lid, phone, instanceName } = body;

        if (!lid || !phone || !instanceName) {
            return NextResponse.json(
                { error: 'Missing required fields: lid, phone, instanceName' },
                { status: 400 }
            );
        }

        await setManualLidMapping(lid, phone, instanceName);

        logger.info({ lid, phone, instanceName }, 'Manual LID mapping set via API');
        await logAdminAction({ admin: auth.admin, action: 'lid_mapping.set', details: { lid, phone, instanceName } });

        return NextResponse.json({
            success: true,
            message: `Mapping set: ${lid} → ${phone}`,
        });
    } catch (error) {
        logger.error({ err: error }, 'Error setting LID mapping');
        return NextResponse.json(
            { error: 'Failed to set mapping' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminRequest(request.headers);
    if ('response' in auth) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const lid = searchParams.get('lid');
        const instanceName = searchParams.get('instanceName');

        if (!lid || !instanceName) {
            return NextResponse.json(
                { error: 'Missing required params: lid, instanceName' },
                { status: 400 }
            );
        }

        const phone = await resolveLidToPhone(lid, instanceName);

        return NextResponse.json({
            lid,
            instanceName,
            phone: phone || null,
            found: !!phone,
        });
    } catch (error) {
        logger.error({ err: error }, 'Error resolving LID mapping');
        return NextResponse.json(
            { error: 'Failed to resolve mapping' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    const auth = await requireAdminRequest(request.headers);
    if ('response' in auth) return auth.response;

    try {
        const body = await request.json();
        const { lid, instanceName } = body;

        if (!lid || !instanceName) {
            return NextResponse.json(
                { error: 'Missing required fields: lid, instanceName' },
                { status: 400 }
            );
        }

        await removeLidMapping(lid, instanceName);

        logger.info({ lid, instanceName }, 'LID mapping removed via API');
        await logAdminAction({ admin: auth.admin, action: 'lid_mapping.remove', details: { lid, instanceName } });

        return NextResponse.json({
            success: true,
            message: `Mapping removed for LID: ${lid}`,
        });
    } catch (error) {
        logger.error({ err: error }, 'Error removing LID mapping');
        return NextResponse.json(
            { error: 'Failed to remove mapping' },
            { status: 500 }
        );
    }
}
