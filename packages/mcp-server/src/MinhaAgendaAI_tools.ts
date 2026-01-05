import { and, asc, eq, gt, ilike } from "drizzle-orm"
import { appointments, db, domainServices as sharedServices, leads, professionals, profiles, customers, salonIntegrations, salons, services, availability, professionalServices, fromBrazilTime } from "@repo/db"

export class MinhaAgendaAITools {

    public async identifyCustomer(phone: string, name?: string, salonId?: string) {
        // Busca cliente existente
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        let profileId: string;
        let created = false;

        if (existing) {
            profileId = existing.id;
        } else if (name) {
            // Se não encontrado e nome fornecido, cria novo cliente
            // Email temporário baseado no telefone (schema requer email notNull)
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone.replace(/\D/g, '')}@temp.com`, // Remove caracteres não numéricos
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            profileId = newProfile.id;
            created = true;
        } else {
            // Cliente não encontrado e sem nome para criar
            return JSON.stringify({ found: false })
        }

        return JSON.stringify({
            id: profileId,
            name: existing?.fullName || name,
            phone: existing?.phone || phone,
            found: !created,
            created: created,
        })
    }

    public async createCustomer(phone: string, name: string, salonId?: string) {
        // Verifica se o cliente já existe
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        let profileId: string;
        let alreadyExists = false;

        if (existing) {
            profileId = existing.id;
            alreadyExists = true;
        } else {
            // Cria novo cliente
            // Email temporário baseado no telefone (schema requer email notNull)
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone.replace(/\D/g, '')}@temp.com`, // Remove caracteres não numéricos do telefone
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            profileId = newProfile.id;
        }

        // Se salonId foi fornecido, garante que existe customer
        if (salonId && phone) {
            const normalizedPhone = phone.replace(/\D/g, "")
            const existingCustomer = await db.query.customers.findFirst({
                where: and(
                    eq(customers.salonId, salonId),
                    eq(customers.phone, normalizedPhone)
                ),
                columns: { id: true },
            })

            if (!existingCustomer) {
                // Cria registro em customers se não existir
                await db.insert(customers).values({
                    salonId,
                    name: existing?.fullName || name,
                    phone: normalizedPhone,
                })
            }
        }

        return JSON.stringify({
            id: profileId,
            name: existing?.fullName || name,
            phone: existing?.phone || phone,
            alreadyExists: alreadyExists,
            created: !alreadyExists,
            message: alreadyExists
                ? "Cliente já existe no sistema"
                : "Cliente criado com sucesso",
        })
    }

    public async updateCustomerName(customerId: string, name: string) {
        // Valida nome
        if (!name || name.trim() === "") {
            throw new Error("Nome não pode ser vazio")
        }

        const trimmedName = name.trim()

        // Verifica se o customer existe
        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, customerId),
            columns: { id: true, name: true, phone: true },
        })

        if (!customer) {
            throw new Error(`Cliente com ID ${customerId} não encontrado`)
        }

        // Atualiza o nome na tabela customers
        const [updatedCustomer] = await db
            .update(customers)
            .set({
                name: trimmedName,
                updatedAt: new Date(),
            })
            .where(eq(customers.id, customerId))
            .returning({
                id: customers.id,
                name: customers.name,
                phone: customers.phone,
            })

        return JSON.stringify({
            id: updatedCustomer.id,
            name: updatedCustomer.name,
            phone: updatedCustomer.phone,
            message: "Nome atualizado com sucesso",
        })
    }

    public async checkAvailability(salonId: string, date: string, professionalId?: string, serviceId?: string, serviceDuration?: number) {
        // Valida se professionalId foi fornecido
        if (!professionalId || professionalId.trim() === "") {
            throw new Error("professionalId é obrigatório para verificar disponibilidade")
        }

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
            professionalId: professionalId,
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

        // Sincroniza com sistemas externos (não bloqueia se falhar)
        try {
            const { syncCreateAppointment } = await import("./services/external-sync")
            await syncCreateAppointment(appointmentId)
        } catch (error: any) {
            // Loga erro mas não falha a operação principal
            console.error("❌ Erro ao sincronizar criação de agendamento:", {
                error: error?.message || error,
                stack: error?.stack,
            })
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

    public async updateAppointment(
        appointmentId: string,
        professionalId?: string,
        serviceId?: string,
        date?: string,
        notes?: string
    ) {
        // Busca agendamento existente para validar
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

        // Usa serviço centralizado
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

        // Sincroniza com sistemas externos (não bloqueia se falhar)
        try {
            const { syncUpdateAppointment } = await import("./services/external-sync")
            await syncUpdateAppointment(appointmentId)
        } catch (error: any) {
            // Loga erro mas não falha a operação principal
            console.error("❌ Erro ao sincronizar atualização de agendamento:", {
                error: error?.message || error,
                stack: error?.stack,
            })
        }

        return JSON.stringify({
            appointmentId: appointmentId,
            message: "Agendamento atualizado com sucesso",
        })
    }

    public async deleteAppointment(appointmentId: string) {
        // Busca agendamento existente para validar
        const existingAppointment = await db.query.appointments.findFirst({
            where: eq(appointments.id, appointmentId),
            columns: { id: true },
        })

        if (!existingAppointment) {
            throw new Error(`Agendamento com ID ${appointmentId} não encontrado`)
        }

        // Sincroniza deleção com sistemas externos ANTES de deletar (para poder buscar dados)
        try {
            const { syncDeleteAppointment } = await import("./services/external-sync")
            await syncDeleteAppointment(appointmentId)
        } catch (error: any) {
            // Loga erro mas não falha a operação principal
            console.error("❌ Erro ao sincronizar deleção de agendamento:", {
                error: error?.message || error,
                stack: error?.stack,
            })
        }

        // Usa serviço centralizado para deletar
        const result = await sharedServices.deleteAppointmentService({
            appointmentId,
        })

        if (!result.success) {
            throw new Error(result.error)
        }

        return JSON.stringify({
            message: `Agendamento ${appointmentId} removido com sucesso`,
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

        // Helper para validar se uma string é um UUID válido
        const isValidUUID = (str: string): boolean => {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return uuidRegex.test(str)
        }

        let resolvedClientId: string | undefined = undefined
        let phoneToSearch: string | undefined = undefined

        // Se clientId foi fornecido, verifica se é UUID válido ou telefone
        if (clientId) {
            if (isValidUUID(clientId)) {
                resolvedClientId = clientId
            } else {
                // Se não é UUID válido, trata como telefone
                phoneToSearch = clientId
            }
        }

        // Se phone foi fornecido diretamente ou se clientId era na verdade um telefone
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
        // Converte datas de UTC para UTC-3 (horário do Brasil) antes de formatar
        const formattedList = upcomingAppointments.map((apt) => {
            // Converte de UTC (banco) para UTC-3 (horário do Brasil)
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
        // Busca registro do cliente no salão (customerId pode ser ID do customer ou phone)
        let customer = await db.query.customers.findFirst({
            where: and(
                eq(customers.salonId, salonId),
                eq(customers.id, customerId)
            ),
            columns: { id: true, preferences: true },
        })

        // Se não encontrou por ID, tenta buscar por phone (caso customerId seja phone)
        if (!customer) {
            customer = await db.query.customers.findFirst({
                where: and(
                    eq(customers.salonId, salonId),
                    eq(customers.phone, customerId.replace(/\D/g, ""))
                ),
                columns: { id: true, preferences: true },
            })
        }

        const currentPreferences = (customer?.preferences as Record<string, unknown>) || {}

        // Atualiza preferências
        const updatedPreferences = {
            ...currentPreferences,
            [key]: value,
        }

        if (customer) {
            // Atualiza existente
            await db
                .update(customers)
                .set({ 
                    preferences: updatedPreferences,
                    updatedAt: new Date()
                })
                .where(eq(customers.id, customer.id))
        } else {
            // Não cria customer automaticamente aqui - deve ser criado antes
            return JSON.stringify({
                error: "Cliente não encontrado no salão",
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
     * Verifica se o salão tem integração ativa com Google Calendar
     * Método helper para verificação rápida sem precisar importar módulos externos
     */
    public async hasGoogleCalendarIntegration(salonId: string): Promise<boolean> {
        const integration = await db.query.salonIntegrations.findFirst({
            where: eq(salonIntegrations.salonId, salonId),
            columns: { id: true, refreshToken: true },
        })

        return !!integration && !!integration.refreshToken
    }

}

