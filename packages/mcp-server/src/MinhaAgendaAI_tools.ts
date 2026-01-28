/**
 * MinhaAgendaAITools - Facade para as classes de tools especializadas
 * 
 * Esta classe mantém a API original para backward compatibility,
 * delegando as operações para classes especializadas por domínio.
 * 
 * Classes especializadas:
 * - CustomerTools: Operações de clientes
 * - AppointmentTools: CRUD de agendamentos
 * - AvailabilityTools: Verificação de disponibilidade
 * - CatalogTools: Serviços, produtos, profissionais
 * - SalonTools: Informações do salão, preferências, leads
 */

import {
    CustomerTools,
    AppointmentTools,
    AvailabilityTools,
    CatalogTools,
    SalonTools,
    getActiveIntegrations as getActiveIntegrationsInternal,
    type ActiveIntegrations,
} from "./tools"

// Re-exporta para manter compatibilidade
export type { ActiveIntegrations }
export { getActiveIntegrationsInternal as getActiveIntegrations }

export class MinhaAgendaAITools {
    // Instâncias das classes especializadas
    private customerTools = new CustomerTools()
    private appointmentTools = new AppointmentTools()
    private availabilityTools = new AvailabilityTools()
    private catalogTools = new CatalogTools()
    private salonTools = new SalonTools()

    // ========================================
    // Métodos de Integração
    // ========================================

    /**
     * Verifica quais integrações estão ativas para um salão
     */
    public async getActiveIntegrations(salonId: string): Promise<ActiveIntegrations> {
        return getActiveIntegrationsInternal(salonId)
    }

    // ========================================
    // Métodos de Cliente (delegados para CustomerTools)
    // ========================================

    public async identifyCustomer(phone: string, name?: string, salonId?: string) {
        return this.customerTools.identifyCustomer(phone, name, salonId)
    }

    public async createCustomer(phone: string, name: string, salonId?: string) {
        return this.customerTools.createCustomer(phone, name, salonId)
    }

    public async updateCustomerName(customerId: string, name: string) {
        return this.customerTools.updateCustomerName(customerId, name)
    }

    // ========================================
    // Métodos de Disponibilidade (delegados para AvailabilityTools)
    // ========================================

    public async checkAvailability(
        salonId: string, 
        date: string, 
        professionalId?: string, 
        serviceId?: string, 
        serviceDuration?: number
    ) {
        return this.availabilityTools.checkAvailability(salonId, date, professionalId, serviceId, serviceDuration)
    }

    public async getProfessionalAvailabilityRules(salonId: string, professionalName: string) {
        return this.availabilityTools.getProfessionalAvailabilityRules(salonId, professionalName)
    }

    // ========================================
    // Métodos de Agendamento (delegados para AppointmentTools)
    // ========================================

    public async createAppointment(
        salonId: string, 
        professionalId: string, 
        phone: string, 
        serviceId: string, 
        date: string, 
        notes?: string
    ) {
        return this.appointmentTools.createAppointment(salonId, professionalId, phone, serviceId, date, notes)
    }

    public async updateAppointment(
        appointmentId: string,
        professionalId?: string,
        serviceId?: string,
        date?: string,
        notes?: string
    ) {
        return this.appointmentTools.updateAppointment(appointmentId, professionalId, serviceId, date, notes)
    }

    public async deleteAppointment(appointmentId: string) {
        return this.appointmentTools.deleteAppointment(appointmentId)
    }

    public async getCustomerUpcomingAppointments(salonId: string, customerPhone: string) {
        return this.appointmentTools.getCustomerUpcomingAppointments(salonId, customerPhone)
    }

    public async getMyFutureAppointments(salonId: string, clientId?: string, phone?: string) {
        return this.appointmentTools.getMyFutureAppointments(salonId, clientId, phone)
    }

    // ========================================
    // Métodos de Catálogo (delegados para CatalogTools)
    // ========================================

    public async getServices(salonId: string, includeInactive?: boolean) {
        return this.catalogTools.getServices(salonId, includeInactive)
    }

    public async getProducts(salonId: string, includeInactive?: boolean) {
        return this.catalogTools.getProducts(salonId, includeInactive)
    }

    public async getProfessionals(salonId: string, includeInactive?: boolean) {
        return this.catalogTools.getProfessionals(salonId, includeInactive)
    }

    // ========================================
    // Métodos do Salão (delegados para SalonTools)
    // ========================================

    public async getSalonDetails(salonId?: string) {
        return this.salonTools.getSalonDetails(salonId)
    }

    public async saveCustomerPreference(
        salonId: string, 
        customerId: string, 
        key: string, 
        value: string | number | boolean
    ) {
        return this.salonTools.saveCustomerPreference(salonId, customerId, key, value)
    }

    public async qualifyLead(
        salonId: string, 
        phoneNumber: string, 
        interest: "high" | "medium" | "low" | "none", 
        notes?: string
    ) {
        return this.salonTools.qualifyLead(salonId, phoneNumber, interest, notes)
    }

    public async hasGoogleCalendarIntegration(salonId: string): Promise<boolean> {
        return this.salonTools.hasGoogleCalendarIntegration(salonId)
    }
}
