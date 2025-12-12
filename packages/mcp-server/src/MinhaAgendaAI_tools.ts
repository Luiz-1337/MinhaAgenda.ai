import { and, asc, eq, gt, ilike } from "drizzle-orm"
import { appointments, db, domainServices as sharedServices, leads, professionals, profiles, salonCustomers, salonIntegrations, salons, services, availability, professionalServices } from "@repo/db"

export class MinhaAgendaAITools {

    public async identifyCustomer(phone: string, name?: string) {
        // Busca cliente existente
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        if (existing) {
            return JSON.stringify({
                id: existing.id,
                name: existing.fullName,
                phone: existing.phone,
                found: true,
            })
        }

        // Se não encontrado e nome fornecido, cria novo cliente
        if (name) {
            // Email temporário baseado no telefone (schema requer email notNull)
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone}@temp.com`, // Email temporário (schema requer notNull)
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            return JSON.stringify({
                id: newProfile.id,
                name: newProfile.fullName,
                phone: newProfile.phone,
                created: true,
            })
        }

        // Cliente não encontrado e sem nome para criar
        return JSON.stringify({ found: false })
    }

    public async checkAvailability(salonId: string, date: string, professionalId?: string, serviceId?: string, serviceDuration?: number) {
        // Se serviceId for fornecido, busca a duração do serviço no DB
        let finalServiceDuration = serviceDuration || 60
        
        if (serviceId && !serviceDuration) {
            const service = await db.query.services.findFirst({
                where: eq(services.id, serviceId),
                columns: { duration: true },
            })
            
            if (service) {
                finalServiceDuration = service.duration
            }
        }

        // Chama o serviço compartilhado
        const slots = await sharedServices.getAvailableSlots({
            date,
            salonId,
            serviceDuration: finalServiceDuration,
            professionalId: professionalId || "",
        })

        return JSON.stringify({
            slots,
            message:
                slots.length > 0
                    ? `Encontrados ${slots.length} horário(s) disponível(is)`
                    : "Nenhum horário disponível para esta data",
        })
    }

    public async createAppointment(salonId: string, professionalId: string, phone: string, serviceId: string, date: string, notes?: string) {
        // Busca cliente pelo telefone
        const client = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true },
        })

        if (!client) {
            throw new Error(`Cliente com telefone ${phone} não encontrado. Por favor, identifique o cliente primeiro.`)
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

        // Sincroniza com Google Calendar (não bloqueia se falhar)
        try {
            await this.createGoogleEventForAppointment(appointmentId, salonId)
        } catch (error) {
            // Loga erro mas não falha a operação principal
            console.error("Erro ao sincronizar agendamento com Google Calendar:", error)
        }

        // Busca info para retorno (opcional, já temos success, mas a mensagem pede nomes)
        const [professional, service] = await Promise.all([
            db.query.professionals.findFirst({
                where: eq(professionals.id, professionalId),
                columns: { name: true },
            }),
            db.query.services.findFirst({
                where: eq(services.id, serviceId),
                columns: { name: true },
            })
        ])

        const dateObj = new Date(date)

        return JSON.stringify({
            appointmentId: appointmentId,
            message: `Agendamento criado com sucesso para ${client.fullName || "cliente"} com ${professional?.name} às ${dateObj.toLocaleString("pt-BR")}`,
        })
    }

    public async cancelAppointment(appointmentId: string, reason?: string) {
        const appointment = await db.query.appointments.findFirst({
            where: eq(appointments.id, appointmentId),
            columns: { id: true, status: true, notes: true },
        })

        if (!appointment) {
            throw new Error(`Agendamento com ID ${appointmentId} não encontrado`)
        }

        if (appointment.status === "cancelled") {
            return JSON.stringify({ message: "Agendamento já estava cancelado" })
        }

        // Atualiza status para cancelado
        await db
            .update(appointments)
            .set({
                status: "cancelled",
                notes: reason
                    ? `${appointment.notes || ""}\n[Cancelado] ${reason}`.trim()
                    : appointment.notes,
            })
            .where(eq(appointments.id, appointmentId))

        // TODO: Remover evento do Google Calendar se houver googleEventId

        return JSON.stringify({
            message: `Agendamento ${appointmentId} cancelado com sucesso`,
        })
    }

    public async rescheduleAppointment(appointmentId: string, newDate: string) {
        // Busca agendamento existente
        const appointment = await db.query.appointments.findFirst({
            where: eq(appointments.id, appointmentId),
            columns: {
                id: true,
                salonId: true,
                serviceId: true,
                professionalId: true,
                clientId: true,
                date: true,
                status: true,
            },
        })

        if (!appointment) {
            throw new Error(`Agendamento com ID ${appointmentId} não encontrado`)
        }

        if (appointment.status === "cancelled") {
            throw new Error("Não é possível reagendar um agendamento cancelado")
        }

        // Busca duração do serviço
        const service = await db.query.services.findFirst({
            where: eq(services.id, appointment.serviceId),
            columns: { duration: true },
        })

        const serviceDuration = service?.duration || 60

        // Verifica disponibilidade no novo horário
        const slots = await sharedServices.getAvailableSlots({
            date: newDate,
            salonId: appointment.salonId,
            serviceDuration,
            professionalId: appointment.professionalId,
        })

        const newDateObj = new Date(newDate)
        const isSlotAvailable = slots.some(
            (slot) => Math.abs(new Date(slot).getTime() - newDateObj.getTime()) < 60000 // 1 minuto de tolerância
        )

        if (!isSlotAvailable) {
            throw new Error("Horário não disponível. Por favor, escolha outro horário.")
        }

        // Transação: cancela antigo e cria novo
        const endTime = new Date(newDateObj.getTime() + serviceDuration * 60 * 1000)

        // Cancela o agendamento antigo
        await db
            .update(appointments)
            .set({ status: "cancelled" })
            .where(eq(appointments.id, appointmentId))

        // Cria novo agendamento
        const [newAppointment] = await db
            .insert(appointments)
            .values({
                salonId: appointment.salonId,
                professionalId: appointment.professionalId,
                clientId: appointment.clientId,
                serviceId: appointment.serviceId,
                date: newDateObj,
                endTime,
                status: "confirmed",
                notes: `Reagendado do agendamento ${appointmentId}`,
            })
            .returning({ id: appointments.id })

        // Sincroniza com Google Calendar (não bloqueia se falhar)
        try {
            await this.createGoogleEventForAppointment(newAppointment.id, appointment.salonId)
        } catch (error) {
            // Loga erro mas não falha a operação principal
            console.error("Erro ao sincronizar reagendamento com Google Calendar:", error)
        }

        return JSON.stringify({
            appointmentId: newAppointment.id,
            message: `Agendamento reagendado com sucesso para ${newDateObj.toLocaleString("pt-BR")}`,
        })
    }

    public async getCustomerUpcomingAppointments(salonId: string, customerPhone: string) {
        // Busca perfil pelo telefone
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

        // Busca agendamentos futuros
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

    public async getMyFutureAppointments(salonId: string, clientId?: string, phone?: string) {
        // Valida que pelo menos um identificador foi fornecido
        if (!clientId && !phone) {
            throw new Error("É necessário fornecer clientId ou phone")
        }

        let resolvedClientId: string | undefined = clientId

        // Se não tiver clientId, busca pelo phone
        if (!resolvedClientId && phone) {
            const profile = await db.query.profiles.findFirst({
                where: eq(profiles.phone, phone),
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

        // Busca agendamentos futuros
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

        // Formata lista para exibição ao usuário (sem IDs, apenas informações legíveis)
        const formattedList = upcomingAppointments.map((apt) => {
            const date = new Date(apt.date)
            const dateStr = date.toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
            })
            const timeStr = date.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
            })

            return `${dateStr} - ${timeStr} - ${apt.service?.name || "Serviço não encontrado"} - ${apt.professional?.name || "Profissional não encontrado"}`
        })

        // Retorna também os dados completos com IDs para uso interno da IA (cancelar/reagendar)
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

    public async getServices(salonId: string, includeInactive?: boolean) {
        const servicesList = await db
            .select({
                id: services.id,
                name: services.name,
                description: services.description,
                duration: services.duration,
                price: services.price,
                isActive: services.isActive,
            })
            .from(services)
            .where(
                and(
                    eq(services.salonId, salonId),
                    includeInactive ? undefined : eq(services.isActive, true)
                )
            )

        return JSON.stringify({
            services: servicesList.map((s) => ({
                ...s,
                price: s.price.toString(),
            })),
            message: `Encontrados ${servicesList.length} serviço(s) disponível(is)`,
        })
    }

    public async saveCustomerPreference(salonId: string, customerId: string, key: string, value: string | number | boolean) {
        // Busca ou cria registro do cliente no salão
        let customer = await db.query.salonCustomers.findFirst({
            where: and(
                eq(salonCustomers.salonId, salonId),
                eq(salonCustomers.profileId, customerId)
            ),
            columns: { id: true, preferences: true },
        })

        const currentPreferences = (customer?.preferences as Record<string, unknown>) || {}

        // Atualiza preferências
        const updatedPreferences = {
            ...currentPreferences,
            [key]: value,
        }

        if (customer) {
            // Atualiza existente
            await db
                .update(salonCustomers)
                .set({ preferences: updatedPreferences })
                .where(eq(salonCustomers.id, customer.id))
        } else {
            // Cria novo registro
            await db.insert(salonCustomers).values({
                salonId,
                profileId: customerId,
                preferences: updatedPreferences,
            })
        }

        return JSON.stringify({
            message: `Preferência "${key}" salva com sucesso para o cliente`,
        })
    }

    public async qualifyLead(salonId: string, phoneNumber: string, interest: "high" | "medium" | "low" | "none", notes?: string) {
        // Busca lead existente
        let lead = await db.query.leads.findFirst({
            where: and(
                eq(leads.salonId, salonId),
                eq(leads.phoneNumber, phoneNumber)
            ),
            columns: { id: true },
        })

        const statusMap: Record<string, string> = {
            high: "recently_scheduled",
            medium: "new",
            low: "cold",
            none: "cold",
        }

        if (lead) {
            // Atualiza lead existente
            await db
                .update(leads)
                .set({
                    status: statusMap[interest] as any,
                    notes: notes || undefined,
                    lastContactAt: new Date(),
                })
                .where(eq(leads.id, lead.id))
        } else {
            // Cria novo lead
            await db.insert(leads).values({
                salonId,
                phoneNumber,
                status: statusMap[interest] as any,
                notes: notes || null,
                lastContactAt: new Date(),
            })
        }

        const interestMap: Record<string, string> = {
            high: "alto",
            medium: "médio",
            low: "baixo",
            none: "nenhum",
        }

        return JSON.stringify({
            message: `Lead qualificado com interesse ${interestMap[interest]}`,
        })
    }

    public async getSalonDetails(salonId?: string) {
        // Se salonId não foi fornecido, lança erro (não temos contexto no padrão atual)
        if (!salonId) {
            throw new Error("salonId é obrigatório. Forneça como parâmetro.")
        }

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: {
                id: true,
                name: true,
                address: true,
                phone: true,
                description: true,
                settings: true,
                workHours: true,
            },
        })

        if (!salon) {
            throw new Error(`Salão com ID ${salonId} não encontrado`)
        }

        const settings = (salon.settings as Record<string, unknown>) || {}
        const workHours = (salon.workHours as Record<string, { start: string; end: string }> | null) || null

        // Extrai cancellation_policy de settings se existir
        const cancellationPolicy = settings.cancellation_policy as string | undefined

        return JSON.stringify({
            id: salon.id,
            name: salon.name,
            address: salon.address || null,
            phone: salon.phone || null,
            description: salon.description || null,
            cancellationPolicy,
            businessHours: workHours, // Formato: { "0": { start: "09:00", end: "18:00" }, ... } (0 = domingo, 6 = sábado)
            settings,
            message: "Informações do salão recuperadas com sucesso",
        })
    }

    public async getProfessionals(salonId: string, includeInactive?: boolean) {
        // Busca profissionais com seus serviços
        const professionalsWithServices = await db
            .select({
                id: professionals.id,
                name: professionals.name,
                isActive: professionals.isActive,
                serviceName: services.name,
            })
            .from(professionals)
            .leftJoin(professionalServices, eq(professionals.id, professionalServices.professionalId))
            .leftJoin(services, eq(professionalServices.serviceId, services.id))
            .where(
                and(
                    eq(professionals.salonId, salonId),
                    includeInactive ? undefined : eq(professionals.isActive, true)
                )
            )

        // Agrupa serviços por profissional
        const professionalsMap = new Map<
            string,
            { id: string; name: string; services: string[]; isActive: boolean }
        >()

        for (const row of professionalsWithServices) {
            if (!professionalsMap.has(row.id)) {
                professionalsMap.set(row.id, {
                    id: row.id,
                    name: row.name,
                    services: [],
                    isActive: row.isActive,
                })
            }

            const professional = professionalsMap.get(row.id)!
            if (row.serviceName) {
                professional.services.push(row.serviceName)
            }
        }

        const professionalsList = Array.from(professionalsMap.values())

        return JSON.stringify({
            professionals: professionalsList,
            message: `Encontrados ${professionalsList.length} profissional(is)`,
        })
    }

    public async getProfessionalAvailabilityRules(salonId: string, professionalName: string) {
        // Busca o profissional pelo nome (case-insensitive)
        const professional = await db.query.professionals.findFirst({
            where: and(
                eq(professionals.salonId, salonId),
                ilike(professionals.name, `%${professionalName}%`)
            ),
            columns: {
                id: true,
                name: true,
            },
        })

        if (!professional) {
            throw new Error(`Profissional "${professionalName}" não encontrado no salão`)
        }

        // Busca as regras de disponibilidade do profissional
        const availabilityRules = await db
            .select({
                dayOfWeek: availability.dayOfWeek,
                startTime: availability.startTime,
                endTime: availability.endTime,
                isBreak: availability.isBreak,
            })
            .from(availability)
            .where(eq(availability.professionalId, professional.id))
            .orderBy(asc(availability.dayOfWeek), asc(availability.startTime))

        // Mapeia números dos dias da semana (0-6) para nomes em português
        const dayNames = [
            "Domingo",
            "Segunda-feira",
            "Terça-feira",
            "Quarta-feira",
            "Quinta-feira",
            "Sexta-feira",
            "Sábado",
        ]

        const rules = availabilityRules.map((rule) => ({
            dayOfWeek: rule.dayOfWeek,
            dayName: dayNames[rule.dayOfWeek] || `Dia ${rule.dayOfWeek}`,
            startTime: rule.startTime,
            endTime: rule.endTime,
            isBreak: rule.isBreak,
        }))

        // Filtra apenas regras de trabalho (não breaks)
        const workRules = rules.filter((rule) => !rule.isBreak)

        return JSON.stringify({
            professionalId: professional.id,
            professionalName: professional.name,
            rules: workRules,
            message: workRules.length > 0
                ? `${professional.name} trabalha ${workRules.length} dia(s) da semana`
                : `${professional.name} não possui regras de trabalho cadastradas`,
        })
    }

    /**
     * Cria evento no Google Calendar para um agendamento.
     * Função auxiliar privada usada internamente.
     */
    private async createGoogleEventForAppointment(
        appointmentId: string,
        salonId: string
    ): Promise<void> {
        // Verifica se há integração Google configurada
        const integration = await db.query.salonIntegrations.findFirst({
            where: eq(salonIntegrations.salonId, salonId),
        })

        if (!integration || !integration.refreshToken) {
            // Salão não tem integração - não é erro, apenas não sincroniza
            return
        }

        // Importa dinamicamente para evitar dependência obrigatória
        try {
            const { google } = await import("googleapis")
            const { OAuth2Client } = await import("google-auth-library")

            // Configura cliente OAuth
            const clientId = process.env.GOOGLE_CLIENT_ID
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET
            const redirectUri = process.env.GOOGLE_REDIRECT_URI

            if (!clientId || !clientSecret) {
                return // Configuração não disponível
            }

            const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)
            oauth2Client.setCredentials({
                refresh_token: integration.refreshToken,
                access_token: integration.accessToken || undefined,
                expiry_date: integration.expiresAt ? integration.expiresAt * 1000 : undefined,
            })

            // Verifica se precisa fazer refresh do token
            const now = Date.now()
            const expiresAt = integration.expiresAt ? integration.expiresAt * 1000 : 0
            const fiveMinutes = 5 * 60 * 1000

            if (!integration.accessToken || (expiresAt && expiresAt - now < fiveMinutes)) {
                const { credentials } = await oauth2Client.refreshAccessToken()
                await db
                    .update(salonIntegrations)
                    .set({
                        accessToken: credentials.access_token || null,
                        expiresAt: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
                        updatedAt: new Date(),
                    })
                    .where(eq(salonIntegrations.id, integration.id))
                oauth2Client.setCredentials(credentials)
            }

            // Busca dados do agendamento
            const appointmentData = await db
                .select({
                    id: appointments.id,
                    date: appointments.date,
                    endTime: appointments.endTime,
                    notes: appointments.notes,
                    professionalName: professionals.name,
                    professionalEmail: professionals.email,
                    serviceName: services.name,
                    clientName: profiles.fullName,
                })
                .from(appointments)
                .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
                .innerJoin(services, eq(appointments.serviceId, services.id))
                .innerJoin(profiles, eq(appointments.clientId, profiles.id))
                .where(eq(appointments.id, appointmentId))
                .limit(1)

            const apt = appointmentData[0]
            if (!apt) {
                return
            }

            const calendar = google.calendar({ version: "v3", auth: oauth2Client })
            const timeZone = process.env.GOOGLE_TIMEZONE || "America/Sao_Paulo"

            // Formata título: "[Profissional] Serviço - Cliente"
            const summary = `[${apt.professionalName}] ${apt.serviceName} - ${apt.clientName || "Cliente"}`

            let description = `Serviço: ${apt.serviceName}\n`
            description += `Cliente: ${apt.clientName || "Cliente"}\n`
            if (apt.notes) {
                description += `\nObservações: ${apt.notes}`
            }

            const attendees = apt.professionalEmail ? [{ email: apt.professionalEmail }] : undefined

            const event = {
                summary,
                description,
                start: {
                    dateTime: apt.date.toISOString(),
                    timeZone,
                },
                end: {
                    dateTime: apt.endTime.toISOString(),
                    timeZone,
                },
                attendees,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: "email", minutes: 24 * 60 },
                        { method: "popup", minutes: 30 },
                    ],
                },
            }

            const response = await calendar.events.insert({
                calendarId: "primary",
                requestBody: event,
            })

            // Atualiza agendamento com ID do evento Google
            if (response.data.id) {
                await db
                    .update(appointments)
                    .set({ googleEventId: response.data.id })
                    .where(eq(appointments.id, appointmentId))
            }
        } catch (error) {
            // Se googleapis não estiver instalado ou houver erro, apenas loga
            console.error("Erro ao criar evento Google Calendar:", error)
            throw error
        }
    }
}

