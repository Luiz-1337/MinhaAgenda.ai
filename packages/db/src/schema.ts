// ============================================================================
// IMPORTS
// ============================================================================
import { relations } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  pgEnum,
  time,
  index,
  date,
  jsonb,
  uniqueIndex,
  bigint,
  customType
} from 'drizzle-orm/pg-core'

// ============================================================================
// CUSTOM TYPES
// ============================================================================
export const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(1536)'
  }
})

// ============================================================================
// ENUMS
// ============================================================================
export const systemRoleEnum = pgEnum('system_role', ['admin', 'user'])
export const profileRoleEnum = pgEnum('profile_role', ['OWNER', 'PROFESSIONAL', 'CLIENT'])
export const subscriptionTierEnum = pgEnum('subscription_tier', ['SOLO', 'PRO', 'ENTERPRISE'])
export const statusEnum = pgEnum('status', ['pending', 'confirmed', 'cancelled', 'completed'])
export const leadStatusEnum = pgEnum('lead_status', ['new', 'cold', 'recently_scheduled'])
export const chatStatusEnum = pgEnum('chat_status', ['active', 'completed'])
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['user', 'assistant', 'system', 'tool'])
export const subscriptionStatusEnum = pgEnum('subscription_status', ['ACTIVE', 'PAID', 'PAST_DUE', 'CANCELED', 'TRIAL'])
export const professionalRoleEnum = pgEnum('professional_role', ['OWNER', 'MANAGER', 'STAFF'])
export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'APPROVED', 'FAILED', 'REFUNDED'])
export const paymentMethodEnum = pgEnum('payment_method', ['PIX', 'CARD', 'BOLETO'])
export const syncStatusEnum = pgEnum('sync_status', ['pending', 'synced', 'failed'])

// ============================================================================
// TABLES - User/Auth
// ============================================================================
export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  // Dados de cobrança
  billingAddress: text('billing_address'),
  billingPostalCode: text('billing_postal_code'), // CEP
  billingCity: text('billing_city'),
  billingState: text('billing_state'), // Estado/UF
  billingCountry: text('billing_country').default('BR'),
  billingAddressComplement: text('billing_address_complement'),
  // Dados legais
  documentType: text('document_type'), // 'CPF' ou 'CNPJ'
  documentNumber: text('document_number'),
  // Google Calendar
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  calendarSyncEnabled: boolean('calendar_sync_enabled').default(false).notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  systemRole: systemRoleEnum('system_role').default('user').notNull(),
  role: profileRoleEnum('role').default('CLIENT').notNull(),
  tier: subscriptionTierEnum('tier').default('SOLO').notNull(),
  salonId: uuid('salon_id'), // FK adicionada via migration para evitar referência circular
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

// ============================================================================
// TABLES - Payments
// ============================================================================
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
    externalId: text('external_id').unique().notNull(), // ID da transação no gateway (Fastify, etc)
    status: paymentStatusEnum('status').default('PENDING').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').default('BRL').notNull(),
    method: paymentMethodEnum('method').notNull(),
    receiptUrl: text('receipt_url'), // URL do comprovante ou boleto
    metadata: jsonb('metadata'), // Payload bruto do gateway para auditoria
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('payments_user_idx').on(table.userId),
    index('payments_external_id_idx').on(table.externalId),
    index('payments_status_idx').on(table.status),
    index('payments_created_at_idx').on(table.createdAt)
  ]
)

// ============================================================================
// TABLES - Salon/Professional
// ============================================================================
export const salons = pgTable(
  'salons',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    ownerId: uuid('owner_id').references(() => profiles.id).notNull(),
    name: text('name').notNull(),
    slug: text('slug').unique().notNull(),
    whatsapp: text('whatsapp').unique(),
    address: text('address'),
    phone: text('phone'),
    description: text('description'),
    subscriptionStatus: subscriptionStatusEnum('subscription_status').default('TRIAL').notNull(),
    settings: jsonb('settings'),
    workHours: jsonb('work_hours'),
    // Evolution API fields
    evolutionInstanceName: text('evolution_instance_name'),
    evolutionInstanceToken: text('evolution_instance_token'), // Optional instance-specific token
    evolutionConnectionStatus: text('evolution_connection_status'), // 'connected' | 'disconnected' | 'connecting'
    evolutionConnectedAt: timestamp('evolution_connected_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('salon_slug_idx').on(table.slug),
    index('salon_owner_idx').on(table.ownerId)
  ]
)

export const services = pgTable(
  'services',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    duration: integer('duration').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    priceType: text('price_type').default('fixed').notNull(), // 'fixed' | 'range'
    priceMin: numeric('price_min', { precision: 10, scale: 2 }),
    priceMax: numeric('price_max', { precision: 10, scale: 2 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('services_salon_idx').on(table.salonId)
  ]
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('products_salon_idx').on(table.salonId)
  ]
)

export const professionals = pgTable(
  'professionals',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => profiles.id),
    role: professionalRoleEnum('role').default('STAFF').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 2 }).default('0').notNull(),
    serviceIds: jsonb('service_ids'), // IDs dos serviços que o profissional executa
    googleCalendarId: text('google_calendar_id'), // ID do calendário secundário no Google Calendar
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('professionals_salon_idx').on(table.salonId),
    index('professionals_user_idx').on(table.userId)
  ]
)

export const professionalServices = pgTable(
  'professional_services',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }).notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('pro_service_unique').on(table.professionalId, table.serviceId)
  ]
)


// ============================================================================
// TABLES - Scheduling
// ============================================================================
export const availability = pgTable(
  'availability',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }).notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    isBreak: boolean('is_break').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('availability_prof_day_idx').on(table.professionalId, table.dayOfWeek)
  ]
)

export const scheduleOverrides = pgTable(
  'schedule_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }).notNull(),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('override_prof_time_idx').on(table.professionalId, table.startTime, table.endTime)
  ]
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id).notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id).notNull(),
    clientId: uuid('client_id').references(() => customers.id).notNull(),
    serviceId: uuid('service_id').references(() => services.id).notNull(),
    date: timestamp('date').notNull(),
    endTime: timestamp('end_time').notNull(),
    status: statusEnum('status').default('pending').notNull(),
    googleEventId: text('google_event_id'),
    trinksEventId: text('trinks_event_id'),
    syncStatus: syncStatusEnum('sync_status').default('pending').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('appt_salon_date_idx').on(table.salonId, table.date),
    index('appt_client_idx').on(table.clientId),
    index('appt_google_event_idx').on(table.googleEventId),
    index('appt_trinks_event_idx').on(table.trinksEventId),
    index('appt_prof_time_idx').on(table.professionalId, table.date, table.endTime),
    index('appt_service_idx').on(table.serviceId)
  ]
)

// ============================================================================
// TABLES - Integrations
// ============================================================================
export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  provider: text('provider').notNull(),
  salonId: uuid('salon_id').references(() => salons.id),
  professionalId: uuid('professional_id').references(() => professionals.id),
  googleCalendarId: text('google_calendar_id'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenType: text('token_type').default('Bearer').notNull(),
  scope: text('scope'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const salonIntegrations = pgTable(
  'salon_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    provider: text('provider').default('google').notNull(),
    refreshToken: text('refresh_token').notNull(),
    accessToken: text('access_token'),
    expiresAt: bigint('expires_at', { mode: 'number' }),
    email: text('email'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('salon_integrations_salon_idx').on(table.salonId),
    uniqueIndex('salon_integrations_salon_provider_unique').on(table.salonId, table.provider)
  ]
)

// ============================================================================
// TABLES - Chat/CRM
// ============================================================================
export const chats = pgTable(
  'chats',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    clientPhone: text('client_phone').notNull(),
    status: chatStatusEnum('status').default('active').notNull(),
    isManual: boolean('is_manual').default(false).notNull(),
    firstUserMessageAt: timestamp('first_user_message_at'),
    firstAgentResponseAt: timestamp('first_agent_response_at'),
    lastBotMessageRequiresResponse: boolean('last_bot_message_requires_response')
      .default(false)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('chats_salon_status_idx').on(table.salonId, table.status)
  ]
)

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  chatId: uuid('chat_id').references(() => chats.id, { onDelete: 'cascade' }).notNull(),
  role: chatMessageRoleEnum('role').notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  requiresResponse: boolean('requires_response').default(false).notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  model: text('model'),
  totalTokens: integer('total_tokens'),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    clientId: uuid('client_id').references(() => profiles.id, { onDelete: 'set null' }),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('chat_messages_salon_client_idx').on(table.salonId, table.clientId),
    index('chat_messages_salon_created_idx').on(table.salonId, table.createdAt)
  ]
)

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id),
    profileId: uuid('profile_id').references(() => profiles.id),
    phoneNumber: text('phone_number').notNull(),
    externalId: text('external_id'),
    name: text('name'),
    email: text('email'),
    source: text('source'),
    status: leadStatusEnum('status').default('new').notNull(),
    notes: text('notes'),
    lastContactAt: timestamp('last_contact_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('lead_status_idx').on(table.status)
  ]
)

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    aiPreferences: text('ai_preferences'),
    preferences: jsonb('preferences'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('customers_salon_phone_unique').on(table.salonId, table.phone),
    index('customers_salon_idx').on(table.salonId),
    index('customers_phone_idx').on(table.phone)
  ]
)

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  salonId: uuid('salon_id').references(() => salons.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status'),
  messageTemplate: text('message_template'),
  segmentationCriteria: jsonb('segmentation_criteria'),
  includeAiCoupon: boolean('include_ai_coupon').default(false).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  totalRecipients: integer('total_recipients').default(0).notNull(),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const campaignRecipients = pgTable('campaign_recipients', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  leadId: uuid('lead_id').references(() => leads.id),
  profileId: uuid('profile_id').references(() => profiles.id),
  addedAt: timestamp('added_at').defaultNow().notNull()
})

export const recoveryFlows = pgTable(
  'recovery_flows',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('recovery_flows_salon_idx').on(table.salonId),
    index('recovery_flows_active_idx').on(table.isActive)
  ]
)

export const recoverySteps = pgTable(
  'recovery_steps',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    recoveryFlowId: uuid('recovery_flow_id').references(() => recoveryFlows.id, { onDelete: 'cascade' }).notNull(),
    stepOrder: integer('step_order').notNull(),
    daysAfterInactivity: integer('days_after_inactivity').notNull(),
    messageTemplate: text('message_template').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('recovery_steps_flow_idx').on(table.recoveryFlowId),
    index('recovery_steps_order_idx').on(table.recoveryFlowId, table.stepOrder),
    uniqueIndex('recovery_steps_flow_order_unique').on(table.recoveryFlowId, table.stepOrder)
  ]
)

export const campaignMessages = pgTable(
  'campaign_messages',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    phoneNumber: text('phone_number').notNull(),
    messageSent: text('message_sent').notNull(),
    status: text('status').default('pending').notNull(),
    sentAt: timestamp('sent_at'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('campaign_messages_campaign_idx').on(table.campaignId),
    index('campaign_messages_status_idx').on(table.status),
    index('campaign_messages_customer_idx').on(table.customerId),
    index('campaign_messages_phone_idx').on(table.phoneNumber)
  ]
)

// ============================================================================
// TABLES - Dashboard Statistics
// ============================================================================
export const aiUsageStats = pgTable(
  'ai_usage_stats',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    date: date('date').notNull(),
    model: text('model').notNull(), // 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o'
    credits: integer('credits').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('ai_usage_salon_date_idx').on(table.salonId, table.date),
    uniqueIndex('ai_usage_salon_date_model_unique').on(table.salonId, table.date, table.model)
  ]
)

export const agentStats = pgTable(
  'agent_stats',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    agentName: text('agent_name').notNull(), // Nome do agente/IA
    totalCredits: integer('total_credits').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('agent_stats_salon_agent_idx').on(table.salonId, table.agentName),
    uniqueIndex('agent_stats_salon_agent_unique').on(table.salonId, table.agentName)
  ]
)

// ============================================================================
// TABLES - AI Agents & RAG
// ============================================================================
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    model: text('model').notNull(),
    tone: text('tone').notNull(),
    whatsappNumber: text('whatsapp_number'), // Opcional - pode conectar depois via Integrações
    whatsappStatus: text('whatsapp_status'), // pending_verification, verifying, verified, failed
    whatsappConnectedAt: timestamp('whatsapp_connected_at'), // Quando foi conectado
    whatsappVerifiedAt: timestamp('whatsapp_verified_at'), // Quando foi verificado
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('agents_salon_idx').on(table.salonId)
  ]
)

export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('embeddings_agent_idx').on(table.agentId)
  ]
)

export const agentKnowledgeBase = pgTable(
  'agent_knowledge_base',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('agent_knowledge_base_agent_idx').on(table.agentId)
  ]
)

export const systemPromptTemplates = pgTable(
  'system_prompt_templates',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }), // null = template global
    name: text('name').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    category: text('category'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('system_prompt_templates_salon_idx').on(table.salonId),
    index('system_prompt_templates_active_idx').on(table.isActive)
  ]
)

// ============================================================================
// TABLES - WhatsApp HSM Templates
// ============================================================================


// ============================================================================
// RELATIONS
// ============================================================================
export const profilesRelations = relations(profiles, ({ many, one }) => ({
  appointments: many(appointments),
  ownedSalons: many(salons),
  salon: one(salons, { fields: [profiles.salonId], references: [salons.id] }),
  payments: many(payments)
}))

export const salonsRelations = relations(salons, ({ one, many }) => ({
  owner: one(profiles, { fields: [salons.ownerId], references: [profiles.id] }),
  services: many(services),
  products: many(products),
  professionals: many(professionals),
  appointments: many(appointments),
  chats: many(chats),
  customers: many(customers),
  campaigns: many(campaigns),
  recoveryFlows: many(recoveryFlows),
  integration: one(salonIntegrations, { fields: [salons.id], references: [salonIntegrations.salonId] }),
  agent: one(agents, { fields: [salons.id], references: [agents.salonId] }),
  systemPromptTemplates: many(systemPromptTemplates)
}))

export const salonIntegrationsRelations = relations(salonIntegrations, ({ one }) => ({
  salon: one(salons, { fields: [salonIntegrations.salonId], references: [salons.id] })
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  salon: one(salons, { fields: [services.salonId], references: [salons.id] }),
  appointments: many(appointments),
  professionalServices: many(professionalServices)
}))

export const productsRelations = relations(products, ({ one }) => ({
  salon: one(salons, { fields: [products.salonId], references: [salons.id] })
}))

export const professionalsRelations = relations(professionals, ({ one, many }) => ({
  salon: one(salons, { fields: [professionals.salonId], references: [salons.id] }),
  user: one(profiles, { fields: [professionals.userId], references: [profiles.id] }),
  availability: many(availability),
  appointments: many(appointments),
  professionalServices: many(professionalServices),
  scheduleOverrides: many(scheduleOverrides)
}))

export const availabilityRelations = relations(availability, ({ one }) => ({
  professional: one(professionals, { fields: [availability.professionalId], references: [professionals.id] })
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  salon: one(salons, { fields: [appointments.salonId], references: [salons.id] }),
  professional: one(professionals, { fields: [appointments.professionalId], references: [professionals.id] }),
  client: one(profiles, { fields: [appointments.clientId], references: [profiles.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] })
}))

export const scheduleOverridesRelations = relations(scheduleOverrides, ({ one }) => ({
  salon: one(salons, { fields: [scheduleOverrides.salonId], references: [salons.id] }),
  professional: one(professionals, { fields: [scheduleOverrides.professionalId], references: [professionals.id] })
}))

export const professionalServicesRelations = relations(professionalServices, ({ one }) => ({
  professional: one(professionals, { fields: [professionalServices.professionalId], references: [professionals.id] }),
  service: one(services, { fields: [professionalServices.serviceId], references: [services.id] })
}))

export const chatsRelations = relations(chats, ({ one, many }) => ({
  salon: one(salons, { fields: [chats.salonId], references: [salons.id] }),
  messages: many(messages)
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] })
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  salon: one(salons, { fields: [chatMessages.salonId], references: [salons.id] }),
  client: one(profiles, { fields: [chatMessages.clientId], references: [profiles.id] })
}))

export const customersRelations = relations(customers, ({ one }) => ({
  salon: one(salons, { fields: [customers.salonId], references: [salons.id] })
}))

export const agentsRelations = relations(agents, ({ one, many }) => ({
  salon: one(salons, { fields: [agents.salonId], references: [salons.id] }),
  embeddings: many(embeddings),
  knowledgeBase: many(agentKnowledgeBase)
}))

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  agent: one(agents, { fields: [embeddings.agentId], references: [agents.id] })
}))

export const agentKnowledgeBaseRelations = relations(agentKnowledgeBase, ({ one }) => ({
  agent: one(agents, { fields: [agentKnowledgeBase.agentId], references: [agents.id] })
}))

export const systemPromptTemplatesRelations = relations(systemPromptTemplates, ({ one }) => ({
  salon: one(salons, { fields: [systemPromptTemplates.salonId], references: [salons.id] })
}))



export const recoveryFlowsRelations = relations(recoveryFlows, ({ one, many }) => ({
  salon: one(salons, { fields: [recoveryFlows.salonId], references: [salons.id] }),
  steps: many(recoverySteps)
}))

export const recoveryStepsRelations = relations(recoverySteps, ({ one }) => ({
  recoveryFlow: one(recoveryFlows, { fields: [recoverySteps.recoveryFlowId], references: [recoveryFlows.id] })
}))

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  salon: one(salons, { fields: [campaigns.salonId], references: [salons.id] }),
  recipients: many(campaignRecipients),
  messages: many(campaignMessages)
}))

export const campaignRecipientsRelations = relations(campaignRecipients, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignRecipients.campaignId], references: [campaigns.id] }),
  customer: one(customers, { fields: [campaignRecipients.customerId], references: [customers.id] }),
  lead: one(leads, { fields: [campaignRecipients.leadId], references: [leads.id] }),
  profile: one(profiles, { fields: [campaignRecipients.profileId], references: [profiles.id] })
}))

export const campaignMessagesRelations = relations(campaignMessages, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignMessages.campaignId], references: [campaigns.id] }),
  customer: one(customers, { fields: [campaignMessages.customerId], references: [customers.id] }),
  profile: one(profiles, { fields: [campaignMessages.profileId], references: [profiles.id] })
}))
