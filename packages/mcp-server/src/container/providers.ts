import { Container } from "./Container"

// Infrastructure - Database
import {
  DrizzleAppointmentRepository,
  DrizzleCustomerRepository,
  DrizzleProfessionalRepository,
  DrizzleServiceRepository,
  DrizzleSalonRepository,
  DrizzleProductRepository,
  DrizzleLeadRepository,
  DrizzleAvailabilityRepository,
} from "../infrastructure/database"
import { DrizzleIntegrationRepository } from "../infrastructure/database/DrizzleIntegrationRepository"

// Infrastructure - External
import { GoogleCalendarService } from "../infrastructure/external/google-calendar"
import { TrinksSchedulerService } from "../infrastructure/external/trinks"
import { TrinksServiceAdapter } from "../infrastructure/external/trinks/TrinksServiceAdapter"

// Application - Services
import { AvailabilityService, SyncService, IntegrationSyncService } from "../application/services"

// Application - Use Cases - Appointment
import {
  CreateAppointmentUseCase,
  UpdateAppointmentUseCase,
  DeleteAppointmentUseCase,
  GetUpcomingAppointmentsUseCase,
} from "../application/use-cases/appointment"

// Application - Use Cases - Availability
import {
  CheckAvailabilityUseCase,
  GetAvailableSlotsUseCase,
} from "../application/use-cases/availability"

// Application - Use Cases - Customer
import {
  IdentifyCustomerUseCase,
  CreateCustomerUseCase,
  UpdateCustomerUseCase,
} from "../application/use-cases/customer"

// Application - Use Cases - Catalog
import {
  GetServicesUseCase,
  GetProductsUseCase,
  GetProfessionalsUseCase,
} from "../application/use-cases/catalog"

// Application - Use Cases - Salon
import {
  GetSalonDetailsUseCase,
  SaveCustomerPreferenceUseCase,
  QualifyLeadUseCase,
  GetProfessionalAvailabilityRulesUseCase,
} from "../application/use-cases/salon"

/**
 * Tokens para injeção de dependência
 */
export const TOKENS = {
  // Repositories
  AppointmentRepository: "IAppointmentRepository",
  CustomerRepository: "ICustomerRepository",
  ProfessionalRepository: "IProfessionalRepository",
  ServiceRepository: "IServiceRepository",
  SalonRepository: "ISalonRepository",
  ProductRepository: "IProductRepository",
  LeadRepository: "ILeadRepository",
  AvailabilityRepository: "IAvailabilityRepository",

  // External Services
  CalendarService: "ICalendarService",
  ExternalScheduler: "IExternalScheduler",
  TrinksService: "ITrinksService",

  // Repositories - Integrations
  IntegrationRepository: "IIntegrationRepository",

  // Application Services
  AvailabilityService: "AvailabilityService",
  SyncService: "SyncService",
  IntegrationSyncService: "IntegrationSyncService",

  // Use Cases - Appointment
  CreateAppointmentUseCase: "CreateAppointmentUseCase",
  UpdateAppointmentUseCase: "UpdateAppointmentUseCase",
  DeleteAppointmentUseCase: "DeleteAppointmentUseCase",
  GetUpcomingAppointmentsUseCase: "GetUpcomingAppointmentsUseCase",

  // Use Cases - Availability
  CheckAvailabilityUseCase: "CheckAvailabilityUseCase",
  GetAvailableSlotsUseCase: "GetAvailableSlotsUseCase",

  // Use Cases - Customer
  IdentifyCustomerUseCase: "IdentifyCustomerUseCase",
  CreateCustomerUseCase: "CreateCustomerUseCase",
  UpdateCustomerUseCase: "UpdateCustomerUseCase",

  // Use Cases - Catalog
  GetServicesUseCase: "GetServicesUseCase",
  GetProductsUseCase: "GetProductsUseCase",
  GetProfessionalsUseCase: "GetProfessionalsUseCase",

  // Use Cases - Salon
  GetSalonDetailsUseCase: "GetSalonDetailsUseCase",
  SaveCustomerPreferenceUseCase: "SaveCustomerPreferenceUseCase",
  QualifyLeadUseCase: "QualifyLeadUseCase",
  GetProfessionalAvailabilityRulesUseCase: "GetProfessionalAvailabilityRulesUseCase",
} as const

/**
 * Registra todos os providers no container
 */
export function registerProviders(container: Container): void {
  // ==========================================================================
  // Repositories (Singletons)
  // ==========================================================================

  container.singleton(TOKENS.AppointmentRepository, () => new DrizzleAppointmentRepository())
  container.singleton(TOKENS.CustomerRepository, () => new DrizzleCustomerRepository())
  container.singleton(TOKENS.ProfessionalRepository, () => new DrizzleProfessionalRepository())
  container.singleton(TOKENS.ServiceRepository, () => new DrizzleServiceRepository())
  container.singleton(TOKENS.SalonRepository, () => new DrizzleSalonRepository())
  container.singleton(TOKENS.ProductRepository, () => new DrizzleProductRepository())
  container.singleton(TOKENS.LeadRepository, () => new DrizzleLeadRepository())
  container.singleton(TOKENS.AvailabilityRepository, () => new DrizzleAvailabilityRepository())

  // ==========================================================================
  // Integration Repository (Singleton)
  // ==========================================================================

  container.singleton(TOKENS.IntegrationRepository, () => new DrizzleIntegrationRepository())

  // ==========================================================================
  // External Services (Lazy - nova instância quando necessário)
  // ==========================================================================

  container.register(TOKENS.CalendarService, () => new GoogleCalendarService())
  container.register(TOKENS.ExternalScheduler, () => new TrinksSchedulerService())
  // TrinksService é criado por salonId, então não pode ser singleton global
  // Será criado sob demanda nos use cases

  // ==========================================================================
  // Application Services (Singletons)
  // ==========================================================================

  container.singleton(TOKENS.AvailabilityService, () => new AvailabilityService(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.AvailabilityRepository),
    container.resolve(TOKENS.SalonRepository),
    container.resolve(TOKENS.CalendarService),
    container.resolve(TOKENS.ExternalScheduler)
  ))

  container.singleton(TOKENS.SyncService, () => new SyncService(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.CustomerRepository),
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.ServiceRepository),
    container.resolve(TOKENS.CalendarService),
    container.resolve(TOKENS.ExternalScheduler)
  ))

  // IntegrationSyncService - usado pelos Use Cases para sincronizar com integrações
  container.singleton(TOKENS.IntegrationSyncService, () => new IntegrationSyncService(
    container.resolve(TOKENS.IntegrationRepository),
    container.resolve(TOKENS.CalendarService),
    undefined, // TrinksService é criado por salonId - será passado por parâmetro quando necessário
    console // Logger simples
  ))

  // ==========================================================================
  // Use Cases - Appointment
  // ==========================================================================

  container.register(TOKENS.CreateAppointmentUseCase, () => new CreateAppointmentUseCase(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.CustomerRepository),
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.ServiceRepository),
    container.resolve(TOKENS.IntegrationSyncService)
  ))

  container.register(TOKENS.UpdateAppointmentUseCase, () => new UpdateAppointmentUseCase(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.CustomerRepository),
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.ServiceRepository),
    container.resolve(TOKENS.IntegrationSyncService)
  ))

  container.register(TOKENS.DeleteAppointmentUseCase, () => new DeleteAppointmentUseCase(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.IntegrationSyncService)
  ))

  container.register(TOKENS.GetUpcomingAppointmentsUseCase, () => new GetUpcomingAppointmentsUseCase(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.CustomerRepository),
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.ServiceRepository)
  ))

  // ==========================================================================
  // Use Cases - Availability
  // ==========================================================================

  container.register(TOKENS.CheckAvailabilityUseCase, () => new CheckAvailabilityUseCase(
    container.resolve(TOKENS.AppointmentRepository),
    container.resolve(TOKENS.AvailabilityRepository),
    container.resolve(TOKENS.SalonRepository),
    container.resolve(TOKENS.ServiceRepository),
    container.resolve(TOKENS.CalendarService),
    container.resolve(TOKENS.ExternalScheduler)
  ))

  container.register(TOKENS.GetAvailableSlotsUseCase, () => new GetAvailableSlotsUseCase(
    container.resolve(TOKENS.CheckAvailabilityUseCase)
  ))

  // ==========================================================================
  // Use Cases - Customer
  // ==========================================================================

  container.register(TOKENS.IdentifyCustomerUseCase, () => new IdentifyCustomerUseCase(
    container.resolve(TOKENS.CustomerRepository)
  ))

  container.register(TOKENS.CreateCustomerUseCase, () => new CreateCustomerUseCase(
    container.resolve(TOKENS.CustomerRepository)
  ))

  container.register(TOKENS.UpdateCustomerUseCase, () => new UpdateCustomerUseCase(
    container.resolve(TOKENS.CustomerRepository)
  ))

  // ==========================================================================
  // Use Cases - Catalog
  // ==========================================================================

  container.register(TOKENS.GetServicesUseCase, () => new GetServicesUseCase(
    container.resolve(TOKENS.ServiceRepository)
  ))

  container.register(TOKENS.GetProductsUseCase, () => new GetProductsUseCase(
    container.resolve(TOKENS.ProductRepository)
  ))

  container.register(TOKENS.GetProfessionalsUseCase, () => new GetProfessionalsUseCase(
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.ServiceRepository)
  ))

  // ==========================================================================
  // Use Cases - Salon
  // ==========================================================================

  container.register(TOKENS.GetSalonDetailsUseCase, () => new GetSalonDetailsUseCase(
    container.resolve(TOKENS.SalonRepository)
  ))

  container.register(TOKENS.SaveCustomerPreferenceUseCase, () => new SaveCustomerPreferenceUseCase(
    container.resolve(TOKENS.CustomerRepository)
  ))

  container.register(TOKENS.QualifyLeadUseCase, () => new QualifyLeadUseCase(
    container.resolve(TOKENS.LeadRepository)
  ))

  container.register(TOKENS.GetProfessionalAvailabilityRulesUseCase, () => new GetProfessionalAvailabilityRulesUseCase(
    container.resolve(TOKENS.ProfessionalRepository),
    container.resolve(TOKENS.AvailabilityRepository)
  ))
}
