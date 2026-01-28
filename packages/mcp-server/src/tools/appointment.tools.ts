/**
 * AppointmentTools - Operações de CRUD de agendamentos
 * 
 * Responsabilidades:
 * - Criar agendamentos
 * - Atualizar agendamentos
 * - Cancelar agendamentos (soft delete)
 * - Listar agendamentos do cliente
 */

import { and, asc, eq, gt, lt } from "drizzle-orm"
import { 
    db, 
    domainServices as sharedServices, 
    appointments, 
    professionals, 
    profiles, 
    services,
    fromBrazilTime,
    createTrinksAppointment, 
    updateTrinksAppointment, 
    deleteTrinksAppointment 
} from "@repo/db"
import { syncCreateAppointment, syncUpdateAppointment, syncDeleteAppointment } from "../services/external-sync"
import { getActiveIntegrations } from "./shared"

export class AppointmentTools {
    /**
     * Cria um novo agendamento
     */
    async createAppointment(
        salonId: string, 
        professionalId: string, 
        phone: string, 
        serviceId: string, 
        date: string, 
        notes?: string
    ): Promise<string> {
        // Busca cliente pelo telefone
        const client = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true },
        })

        if (!client) {
            throw new Error(`Cliente com telefone ${phone} não encontrado. Por favor, identifique o cliente primeiro.`)
        }

        // Busca duração do serviço para verificação de conflito
        const service = await db.query.services.findFirst({
            where: eq(services.id, serviceId),
            columns: { duration: true, name: true },
        })

        if (!service) {
            throw new Error(`Serviço com ID ${serviceId} não encontrado`)
        }

        // Verifica conflito de horário antes de criar
        const startDate = new Date(date)
        const endDate = new Date(startDate.getTime() + service.duration * 60 * 1000)

        const conflict = await db.query.appointments.findFirst({
            where: and(
                eq(appointments.professionalId, professionalId),
                eq(appointments.status, 'confirmed'),
                lt(appointments.date, endDate),
                gt(appointments.endTime, startDate)
            ),
            columns: { id: true, date: true, endTime: true },
        })

        if (conflict) {
            throw new Error(JSON.stringify({
                code: "APPOINTMENT_CONFLICT",
                message: "Já existe um agendamento neste horário para este profissional",
                suggestion: "Use checkAvailability para ver horários disponíveis",
                conflictingAppointment: { 
                    id: conflict.id, 
                    date: conflict.date.toISOString(),
                    endTime: conflict.endTime.toISOString()
                }
            }))
        }

        // Usa serviço centralizado
        const result = await sharedServices.createAppointmentService({
            salonId,
            professionalId,
            clientId: client.id,
            serviceId,
            date,
            notes,
        })

        if (!result.success) {
            throw new Error(result.error)
        }

        const appointmentId = result.data.appointmentId

        // Sincroniza com sistemas externos (não bloqueia se falhar)
        const integrations = await getActiveIntegrations(salonId)

        if (integrations.google?.isActive) {
            try {
                await syncCreateAppointment(appointmentId)
            } catch (error: any) {
                console.error("❌ Erro ao sincronizar criação de agendamento com Google Calendar:", {
                    error: error?.message || error,
                    stack: error?.stack,
                })
            }
        }

        if (integrations.trinks?.isActive) {
            try {
                await createTrinksAppointment(appointmentId, salonId)
            } catch (error: any) {
                console.error("❌ Erro ao sincronizar criação de agendamento com Trinks:", {
                    error: error?.message || error,
                    stack: error?.stack,
                })
            }
        }

        // Busca nome do profissional para retorno
        const professional = await db.query.professionals.findFirst({
            where: eq(professionals.id, professionalId),
            columns: { name: true },
        })

        return JSON.stringify({
            appointmentId: appointmentId,
            message: `Agendamento criado com sucesso para ${client.fullName || "cliente"} com ${professional?.name || "profissional"} às ${startDate.toLocaleString("pt-BR")}`,
        })
    }

    /**
     * Atualiza um agendamento existente
     */
    async updateAppointment(
        appointmentId: string,
        professionalId?: string,
        serviceId?: string,
        date?: string,
        notes?: string
    ): Promise<string> {
        const existingAppointment = await db.query.appointments.findFirst({
            where: eq(appointments.id, appointmentId),
            columns: { id: true, status: true },
        })

        if (!existingAppointment) {
            throw new Error(`Agendamento com ID ${appointmentId} não encontrado`)
        }

        if (existingAppointment.status === "cancelled") {
            throw new Error("Não é possível atualizar um agendamento cancelado")
        }

        const result = await sharedServices.updateAppointmentService({
            appointmentId,
            professionalId,
            serviceId,
            date: date ? date : undefined,
            notes,
        })

        if (!result.success) {
            throw new Error(result.error)
        }

        const appointment = await db.query.appointments.findFirst({
            where: eq(appointments.id, appointmentId),
            columns: { salonId: true },
        })

        if (!appointment) {
            throw new Error(`Agendamento com ID ${appointmentId} não encontrado após atualização`)
        }

        // Sincroniza com sistemas externos
        const integrations = await getActiveIntegrations(appointment.salonId)

        if (integrations.google?.isActive) {
            try {
                await syncUpdateAppointment(appointmentId)
            } catch (error: any) {
                console.error("❌ Erro ao sincronizar atualização de agendamento com Google Calendar:", {
                    error: error?.message || error,
                    stack: error?.stack,
                })
            }
        }

        if (integrations.trinks?.isActive) {
            try {
                await updateTrinksAppointment(appointmentId, appointment.salonId)
            } catch (error: any) {
                console.error("❌ Erro ao sincronizar atualização de agendamento com Trinks:", {
                    error: error?.message || error,
                    stack: error?.stack,
                })
            }
        }

        return JSON.stringify({
            appointmentId: appointmentId,
            message: "Agendamento atualizado com sucesso",
        })
    }

    /**
     * Cancela um agendamento (soft delete)
     */
    async deleteAppointment(appointmentId: string): Promise<string> {
        const existingAppointment = await db.query.appointments.findFirst({
            where: eq(appointments.id, appointmentId),
            columns: { id: true, salonId: true, status: true, googleEventId: true, trinksEventId: true },
        })

        if (!existingAppointment) {
            throw new Error(`Agendamento com ID ${appointmentId} não encontrado`)
        }

        if (existingAppointment.status === 'cancelled') {
            return JSON.stringify({
                message: `Agendamento ${appointmentId} já está cancelado`,
                alreadyCancelled: true,
            })
        }

        const integrations = await getActiveIntegrations(existingAppointment.salonId)

        if (integrations.google?.isActive) {
            try {
                await syncDeleteAppointment(appointmentId)
            } catch (error: any) {
                console.error("❌ Erro ao sincronizar cancelamento de agendamento com Google Calendar:", {
                    error: error?.message || error,
                    stack: error?.stack,
                })
            }
        }

        if (integrations.trinks?.isActive) {
            try {
                await deleteTrinksAppointment(appointmentId, existingAppointment.salonId)
            } catch (error: any) {
                if (error?.message?.includes('não encontrado')) {
                    console.log("ℹ️ Agendamento não encontrado no Trinks, pulando sincronização")
                } else {
                    console.error("❌ Erro ao sincronizar cancelamento de agendamento com Trinks:", {
                        error: error?.message || error,
                        stack: error?.stack,
                    })
                }
            }
        }

        // Soft delete
        await db
            .update(appointments)
            .set({ 
                status: 'cancelled',
                updatedAt: new Date(),
            })
            .where(eq(appointments.id, appointmentId))

        return JSON.stringify({
            message: `Agendamento ${appointmentId} cancelado com sucesso`,
            appointmentId,
            cancelled: true,
        })
    }

    /**
     * Busca agendamentos futuros de um cliente por telefone
     */
    async getCustomerUpcomingAppointments(salonId: string, customerPhone: string): Promise<string> {
        const profile = await db.query.profiles.findFirst({
            where: eq(profiles.phone, customerPhone),
            columns: { id: true },
        })

        if (!profile) {
            return JSON.stringify({
                appointments: [],
                message: "Cliente não encontrado",
            })
        }

        const now = new Date()

        const upcomingAppointments = await db
            .select({
                id: appointments.id,
                date: appointments.date,
                endTime: appointments.endTime,
                status: appointments.status,
                notes: appointments.notes,
                service: {
                    name: services.name,
                },
                professional: {
                    name: professionals.name,
                },
            })
            .from(appointments)
            .leftJoin(services, eq(appointments.serviceId, services.id))
            .leftJoin(professionals, eq(appointments.professionalId, professionals.id))
            .where(
                and(
                    eq(appointments.salonId, salonId),
                    eq(appointments.clientId, profile.id),
                    gt(appointments.date, now),
                    eq(appointments.status, "confirmed")
                )
            )

        return JSON.stringify({
            appointments: upcomingAppointments.map((apt) => ({
                id: apt.id,
                date: apt.date.toISOString(),
                endTime: apt.endTime.toISOString(),
                status: apt.status,
                serviceName: apt.service?.name || "Serviço não encontrado",
                professionalName: apt.professional?.name || "Profissional não encontrado",
                notes: apt.notes,
            })),
            message: `Encontrados ${upcomingAppointments.length} agendamento(s) futuro(s)`,
        })
    }

    /**
     * Busca agendamentos futuros do cliente atual
     */
    async getMyFutureAppointments(salonId: string, clientId?: string, phone?: string): Promise<string> {
        if (!clientId && !phone) {
            throw new Error("É necessário fornecer clientId ou phone")
        }

        const isValidUUID = (str: string): boolean => {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return uuidRegex.test(str)
        }

        let resolvedClientId: string | undefined = undefined
        let phoneToSearch: string | undefined = undefined

        if (clientId) {
            if (isValidUUID(clientId)) {
                resolvedClientId = clientId
            } else {
                phoneToSearch = clientId
            }
        }

        if (!resolvedClientId && (phone || phoneToSearch)) {
            const searchPhone = phone || phoneToSearch
            const profile = await db.query.profiles.findFirst({
                where: eq(profiles.phone, searchPhone!),
                columns: { id: true },
            })

            if (!profile) {
                return JSON.stringify({
                    formattedList: [],
                    appointments: [],
                    message: "Cliente não encontrado com o telefone fornecido",
                })
            }

            resolvedClientId = profile.id
        }

        if (!resolvedClientId) {
            throw new Error("Não foi possível identificar o cliente")
        }

        const now = new Date()

        const upcomingAppointments = await db
            .select({
                id: appointments.id,
                date: appointments.date,
                endTime: appointments.endTime,
                status: appointments.status,
                notes: appointments.notes,
                service: {
                    name: services.name,
                },
                professional: {
                    id: professionals.id,
                    name: professionals.name,
                },
            })
            .from(appointments)
            .leftJoin(services, eq(appointments.serviceId, services.id))
            .leftJoin(professionals, eq(appointments.professionalId, professionals.id))
            .where(
                and(
                    eq(appointments.salonId, salonId),
                    eq(appointments.clientId, resolvedClientId),
                    gt(appointments.date, now),
                    eq(appointments.status, "confirmed")
                )
            )
            .orderBy(asc(appointments.date))

        const formattedList = upcomingAppointments.map((apt) => {
            const dateBrazil = fromBrazilTime(apt.date)
            const dateStr = dateBrazil.toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "America/Sao_Paulo"
            })
            const timeStr = dateBrazil.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo"
            })

            return `${dateStr} - ${timeStr} - ${apt.service?.name || "Serviço não encontrado"} - ${apt.professional?.name || "Profissional não encontrado"}`
        })

        const appointmentsData = upcomingAppointments.map((apt) => ({
            id: apt.id,
            date: apt.date.toISOString(),
            endTime: apt.endTime.toISOString(),
            status: apt.status,
            serviceName: apt.service?.name || "Serviço não encontrado",
            professionalName: apt.professional?.name || "Profissional não encontrado",
            professionalId: apt.professional?.id || "",
            notes: apt.notes,
        }))

        return JSON.stringify({
            formattedList,
            appointments: appointmentsData,
            message: `Encontrados ${upcomingAppointments.length} agendamento(s) futuro(s)`,
        })
    }
}
