import { db, waitingList, campaigns, campaignMessages, services, professionals, profiles } from "../index"
import { eq, and, or, lte, gt, isNull } from "drizzle-orm"

/**
 * Slot Filler Service
 * Disparado quando um agendamento é cancelado ou deletado.
 * Busca na fila de espera por clientes interessados no horário que vagou.
 */
export async function processVacantSlot(params: {
    salonId: string
    professionalId: string
    serviceId: string
    dateUtc: Date
}) {
    console.log(`[Slot Filler] Processing vacant slot at ${params.dateUtc.toISOString()} for salon ${params.salonId}`);

    try {
        // 1. Encontrar pessoas na waiting_list interessadas
        const waiters = await db.query.waitingList.findMany({
            where: and(
                eq(waitingList.salonId, params.salonId),
                eq(waitingList.status, 'active'),
                // Se a pessoa especificou profissional, tem que ser ele. Se não especificou, aceita qualquer um.
                or(
                    isNull(waitingList.professionalId),
                    params.professionalId ? eq(waitingList.professionalId, params.professionalId) : undefined
                ),
                // Se a pessoa especificou serviço, tem que bater. Se não especificou, aceita qualquer um.
                or(
                    isNull(waitingList.serviceId),
                    params.serviceId ? eq(waitingList.serviceId, params.serviceId) : undefined
                ),
                // Verificar datas (from <= dateUtc <= to)
                or(
                    isNull(waitingList.preferredDateFrom),
                    lte(waitingList.preferredDateFrom, params.dateUtc)
                ),
                or(
                    isNull(waitingList.preferredDateTo),
                    gt(waitingList.preferredDateTo, params.dateUtc)
                )
            )
        });

        if (waiters.length === 0) {
            console.log(`[Slot Filler] No clients waiting for this slot.`);
            return;
        }

        // 2. Acionar campaigns de Marketing
        console.log(`[Slot Filler] Found ${waiters.length} clients in waitlist. Dispatching notifications...`);

        const aptService = await db.query.services.findFirst({
            where: eq(services.id, params.serviceId),
            columns: { name: true }
        });

        const professional = await db.query.professionals.findFirst({
            where: eq(professionals.id, params.professionalId),
            columns: { name: true }
        });

        const serviceName = aptService?.name || "serviço";
        const profName = professional?.name || "nosso profissional";
        const dateFormatted = params.dateUtc.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        const defaultMessage = `Olá! Uma vaga de *${serviceName}* com ${profName} acabou de liberar para ${dateFormatted}!\n\nGostaria de aproveitar e reservar? Responda "Sim" para eu confirmar para você!`;

        // Create temporary campaign
        const [campaign] = await db.insert(campaigns).values({
            salonId: params.salonId,
            name: `Vaga Liberada - ${serviceName}`,
            description: 'Aviso automático de vaga liberada via Waitlist',
            status: 'active',
            segmentationCriteria: { type: 'waitlist_slot_filler' },
            startsAt: new Date()
        }).returning({ id: campaigns.id });

        for (const waiter of waiters) {
            const profile = await db.query.profiles.findFirst({
                where: eq(profiles.id, waiter.clientId),
                columns: { phone: true }
            });

            if (!profile || !profile.phone) continue;

            const digits = profile.phone.replace(/\D/g, '');
            if (!digits) continue;
            const normalizedNumber = digits.length >= 12 && digits.startsWith('55') ? `+${digits}` : `+55${digits}`;

            await db.insert(campaignMessages).values({
                campaignId: campaign.id,
                phoneNumber: normalizedNumber,
                messageSent: defaultMessage,
                status: 'pending',
                sentAt: new Date(),
            });

            // Note: marking the waitingList status to notified or removing it is optional.
            // keeping it active allows them to be notified again.
        }
    } catch (err) {
        console.error(`[Slot Filler] Error processing vacant slot:`, err);
    }
}
