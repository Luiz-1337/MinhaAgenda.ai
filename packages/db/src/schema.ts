// ============================================================================
// IMPORTS
// ============================================================================
import { relations, sql } from 'drizzle-orm'
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
  unique,
  bigint,
  customType,
  primaryKey
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
export const syncSourceEnum = pgEnum('sync_source', ['app', 'google'])

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
  // Stripe
  stripeCustomerId: text('stripe_customer_id').unique(),
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
    // payments_external_id_idx removido — redundante com o UNIQUE de external_id (HIG-3)
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
    subscriptionStatusChangedAt: timestamp('subscription_status_changed_at').defaultNow(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    extraCredits: bigint('extra_credits', { mode: 'number' }).default(0).notNull(),
    aiRetentionEnabled: boolean('ai_retention_enabled').default(false).notNull(),
    aiKanbanClassificationEnabled: boolean('ai_kanban_classification_enabled').default(false).notNull(),
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
    // salon_slug_idx removido — redundante com o UNIQUE de slug (HIG-3)
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
    // Preço "Sob Avaliação": a IA informa que o valor depende de avaliação e mesmo
    // assim permite agendar (não inventa preço). Independente de priceType.
    priceOnRequest: boolean('price_on_request').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Placeholder interno criado por integrações (ex.: "Bloqueio de Horário" da
    // sync do Google Calendar). Itens is_system=true são internos: NUNCA aparecem
    // nos catálogos do cliente nem na tela de serviços do dono, e não são agendáveis.
    isSystem: boolean('is_system').default(false).notNull(),
    averageCycleDays: integer('average_cycle_days'),
    // Restrições de agenda POR SERVIÇO (null/vazio = sem restrição → comportamento atual):
    // - allowedWeekdays: dias da semana permitidos, 0=Domingo..6=Sábado (convenção getDay()).
    // - allowedStartTimes: horários de início discretos "HH:mm" (horário de Brasília).
    //   Quando setado, os slots oferecidos/validados são SOMENTE esses horários.
    // - durationMax: teto da faixa de duração (min). A agenda reserva o MAIOR tempo
    //   (durationMax ?? duration); `duration` permanece como piso/exibição.
    allowedWeekdays: jsonb('allowed_weekdays'),
    allowedStartTimes: jsonb('allowed_start_times'),
    durationMax: integer('duration_max'),
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
    // Identidade de pessoa compartilhada entre salões (mesma pessoa física = mesmo personKey,
    // inclusive entre contas diferentes). Usado para unir livre/ocupado e travar o booking
    // por pessoa, evitando double-booking de um profissional que atende em mais de um salão.
    // Null = pessoa isolada (fallback para o próprio professionalId).
    personKey: uuid('person_key'),
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
    index('professionals_user_idx').on(table.userId),
    index('professionals_person_key_idx').on(table.personKey)
  ]
)

export const professionalServices = pgTable(
  'professional_services',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }).notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
    // A presença da linha = profissional EXECUTA o serviço (capability).
    // isSpecialist = preferência: a IA oferece o especialista primeiro, mas pode
    // agendar com outro profissional capaz se o cliente pedir.
    isSpecialist: boolean('is_specialist').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('pro_service_unique').on(table.professionalId, table.serviceId),
    index('pro_service_specialist_idx').on(table.serviceId, table.isSpecialist)
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
    index('override_prof_time_idx').on(table.professionalId, table.startTime, table.endTime),
    // FK schedule_overrides.salon_id sem índice de cobertura — HIG-4 (reconciliação 21/jun)
    index('schedule_overrides_salon_idx').on(table.salonId)
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
    syncSource: syncSourceEnum('sync_source'),
    notes: text('notes'),
    reminderSentAt: timestamp('reminder_sent_at'),
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

export const waitingList = pgTable(
  'waiting_list',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    clientId: uuid('client_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }),
    preferredDateFrom: timestamp('preferred_date_from'),
    preferredDateTo: timestamp('preferred_date_to'),
    status: text('status', { enum: ['active', 'fulfilled', 'cancelled', 'expired'] }).default('active').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('waiting_salon_idx').on(table.salonId),
    index('waiting_client_idx').on(table.clientId),
    index('waiting_status_idx').on(table.status)
  ]
)

// ============================================================================
// TABLES - Integrations
// ============================================================================
// integrations removed (obsolete)

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
    initialSyncDone: boolean('initial_sync_done').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('salon_integrations_salon_idx').on(table.salonId),
    uniqueIndex('salon_integrations_salon_provider_unique').on(table.salonId, table.provider)
  ]
)

// ============================================================================
// TABLES - Google Calendar Sync
// ============================================================================
export const googleCalendarSyncChannels = pgTable(
  'google_calendar_sync_channels',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    calendarId: text('calendar_id').notNull(),
    channelId: text('channel_id').unique().notNull(),
    resourceId: text('resource_id').notNull(),
    expiration: timestamp('expiration').notNull(),
    syncToken: text('sync_token'),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('gcal_sync_salon_idx').on(table.salonId),
    index('gcal_sync_expiration_idx').on(table.expiration)
  ]
)

// ============================================================================
// TABLES - Chat/CRM
// ============================================================================
export const chatKanbanColumns = pgTable(
  'chat_kanban_columns',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    color: text('color').default('#94a3b8').notNull(),
    position: integer('position').default(0).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    systemKey: text('system_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('chat_kanban_columns_salon_idx').on(table.salonId, table.position),
    // Refletem constraints existentes só no banco (reconciliação 21/jun — DRIFT-1)
    uniqueIndex('chat_kanban_columns_salon_default').on(table.salonId).where(sql`is_default = true`),
    uniqueIndex('chat_kanban_columns_salon_system_key_idx')
      .on(table.salonId, table.systemKey)
      .where(sql`system_key IS NOT NULL`)
  ]
)

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
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    lastBotMessageRequiresResponse: boolean('last_bot_message_requires_response')
      .default(false)
      .notNull(),
    kanbanColumnId: uuid('kanban_column_id').references(() => chatKanbanColumns.id, { onDelete: 'set null' }),
    kanbanPosition: numeric('kanban_position', { precision: 20, scale: 10 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('chats_salon_status_idx').on(table.salonId, table.status),
    index('chats_agent_idx').on(table.agentId),
    index('chats_kanban_idx').on(table.salonId, table.kanbanColumnId),
    // FK chats.kanban_column_id (o composto acima começa por salonId) — HIG-4
    index('chats_kanban_column_idx').on(table.kanbanColumnId),
    // Reflete UNIQUE constraint existente só no banco (reconciliação 21/jun — DRIFT-1)
    unique('chats_salon_id_client_phone_unique').on(table.salonId, table.clientPhone)
  ]
)

export const messages = pgTable(
  'messages',
  {
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
    // Outbound delivery tracking (ver migration 0040). NULL para mensagens recebidas.
    // providerMessageId = key.id da Evolution; correlaciona o evento messages.update.
    providerMessageId: text('provider_message_id'),
    // 'sent' | 'retrying' | 'delivered' | 'failed' | 'undelivered'
    deliveryStatus: text('delivery_status'),
    deliveryAttempts: integer('delivery_attempts').default(0).notNull(),
    // Mídia recebida do cliente (foto/áudio do WhatsApp). NULL em mensagens de texto.
    // mediaType: 'image' | 'audio' | 'video' | 'document'. mediaPath: caminho no
    // bucket privado 'whatsapp-media' (Supabase Storage), servido via URL assinada.
    mediaType: text('media_type'),
    mediaPath: text('media_path'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('messages_provider_message_id_idx').on(table.providerMessageId),
    // FK messages.chat_id sem índice (1858 linhas → Seq Scan na abertura de conversa) — HIG-1
    index('messages_chat_created_idx').on(table.chatId, table.createdAt)
  ]
)

// chatMessages removed (obsolete)

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
    optedOutAt: timestamp('opted_out_at'),
    optOutReason: text('opt_out_reason'),
    optOutSource: text('opt_out_source'), // 'keyword' | 'manual' | 'admin'
    // Placeholder interno criado por integrações (ex.: o contato "Google Calendar"
    // que recebe os bloqueios da sync). is_system=true => não aparece no CRM nem
    // entra em segmentações de marketing.
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('customers_salon_phone_unique').on(table.salonId, table.phone),
    index('customers_salon_idx').on(table.salonId),
    index('customers_phone_idx').on(table.phone),
    // Reflete índice parcial existente só no banco (reconciliação 21/jun — DRIFT-1)
    index('customers_active_phone_idx').on(table.salonId, table.phone).where(sql`opted_out_at IS NULL`)
  ]
)

export const customerTrinksProfile = pgTable(
  'customer_trinks_profile',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    trinksClientId: text('trinks_client_id'),
    totalSpent: numeric('total_spent', { precision: 10, scale: 2 }).default('0').notNull(),
    averageTicket: numeric('average_ticket', { precision: 10, scale: 2 }).default('0').notNull(),
    visitCount90Days: integer('visit_count_90_days').default(0).notNull(),
    visitCount365Days: integer('visit_count_365_days').default(0).notNull(),
    lastVisitAt: timestamp('last_visit_at'),
    firstVisitAt: timestamp('first_visit_at'),
    tags: jsonb('tags').default([]).notNull(),
    recentServices: jsonb('recent_services').default([]).notNull(),
    vipScore: integer('vip_score').default(0).notNull(),
    trinksNotFound: boolean('trinks_not_found').default(false).notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('customer_trinks_profile_customer_idx').on(table.customerId),
    index('customer_trinks_profile_salon_synced_idx').on(table.salonId, table.syncedAt),
    // Reflete índice parcial existente só no banco (reconciliação 21/jun — DRIFT-1)
    index('customer_trinks_profile_vip_idx').on(table.salonId, table.vipScore.desc()).where(sql`vip_score > 0`)
  ]
)

// Catálogo de tags personalizáveis por salão (nome + cor). Reutilizáveis e
// atribuíveis a vários contatos. Conceito diferente de customer_trinks_profile.tags
// (aquele é label vindo do Trinks).
export const customerTags = pgTable(
  'customer_tags',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    color: text('color').default('#94a3b8').notNull(),
    position: integer('position').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('customer_tags_salon_idx').on(table.salonId, table.position),
    uniqueIndex('customer_tags_salon_name_unique').on(table.salonId, table.name)
  ]
)

// Junção contato <-> tag (M:N). Carrega salonId denormalizado para indexação/RLS
// por tenant sem join. Cascade em ambos os lados: apagar a tag ou o contato
// remove a atribuição automaticamente.
export const customerTagAssignments = pgTable(
  'customer_tag_assignments',
  {
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
    tagId: uuid('tag_id').references(() => customerTags.id, { onDelete: 'cascade' }).notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.tagId] }),
    index('customer_tag_assignments_tag_idx').on(table.tagId),
    index('customer_tag_assignments_salon_customer_idx').on(table.salonId, table.customerId)
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
    useAiGeneration: boolean('use_ai_generation').default(false).notNull(),
    includeAiCoupon: boolean('include_ai_coupon').default(false).notNull(),
    aiToneOverride: text('ai_tone_override'),
    aiSkipOptOutFooter: boolean('ai_skip_opt_out_footer').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('recovery_steps_flow_idx').on(table.recoveryFlowId),
    // recovery_steps_order_idx removido — redundante com o uniqueIndex abaixo (HIG-3)
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
    recoveryStepId: uuid('recovery_step_id').references(() => recoverySteps.id, { onDelete: 'set null' }),
    phoneNumber: text('phone_number').notNull(),
    messageSent: text('message_sent').notNull(),
    messageHash: text('message_hash'),
    generatedByAi: boolean('generated_by_ai').default(false).notNull(),
    tokensUsed: integer('tokens_used'),
    modelUsed: text('model_used'),
    status: text('status').default('pending').notNull(),
    sentAt: timestamp('sent_at'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('campaign_messages_campaign_idx').on(table.campaignId),
    index('campaign_messages_status_idx').on(table.status),
    index('campaign_messages_customer_idx').on(table.customerId),
    index('campaign_messages_phone_idx').on(table.phoneNumber),
    index('campaign_messages_recovery_step_idx').on(table.recoveryStepId),
    // Refletem índices parciais existentes só no banco (reconciliação 21/jun — DRIFT-1).
    // NOTA: campaign_msgs_dedup usa a expressão (sent_at)::date — o drizzle-kit tem suporte
    // irregular a índices por expressão; valide o diff em dry-run antes de qualquer generate.
    uniqueIndex('campaign_msgs_dedup')
      .on(table.customerId, table.recoveryStepId, sql`((sent_at)::date)`)
      .where(sql`customer_id IS NOT NULL AND recovery_step_id IS NOT NULL`),
    index('campaign_msgs_recent_ai_idx')
      .on(table.customerId, table.sentAt.desc())
      .where(sql`generated_by_ai = true AND status = 'sent'`)
  ]
)

export const retentionResponseAudit = pgTable(
  'retention_response_audit',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    retentionCampaignMessageId: uuid('retention_campaign_message_id').references(() => campaignMessages.id, { onDelete: 'set null' }),
    responseBody: text('response_body').notNull(),
    softSignalMatch: boolean('soft_signal_match').default(true).notNull(),
    sentimentLabel: text('sentiment_label'), // 'annoyed' | 'neutral' | 'positive'
    sentimentConfidence: numeric('sentiment_confidence', { precision: 3, scale: 2 }),
    reviewedAt: timestamp('reviewed_at'),
    actionTaken: text('action_taken'), // 'auto_opt_out' | 'dismissed' | 'manual_opt_out'
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('retention_audit_salon_idx').on(table.salonId),
    index('retention_audit_customer_idx').on(table.customerId),
    index('retention_audit_unreviewed_idx').on(table.reviewedAt),
    index('retention_audit_created_idx').on(table.createdAt)
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
    model: text('model').notNull(), // 'gpt-5.4-mini-2026-03-17', 'gpt-4.1', 'gpt-4o'
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
    // agent_stats_salon_agent_idx removido — redundante com o uniqueIndex abaixo (HIG-3)
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
    // Evolution API fields (per-agent for PRO/Enterprise)
    evolutionInstanceName: text('evolution_instance_name'),
    evolutionInstanceToken: text('evolution_instance_token'),
    evolutionConnectionStatus: text('evolution_connection_status'), // 'connected' | 'disconnected' | 'connecting'
    evolutionConnectedAt: timestamp('evolution_connected_at'),
    // WhatsApp Cloud API (Meta) fields (per-agent) — migration 019
    messagingProvider: text('messaging_provider').default('evolution').notNull(), // 'evolution' | 'cloud'
    whatsappPhoneNumberId: text('whatsapp_phone_number_id'), // phone_number_id da Cloud API — chave de resolução de tenant do webhook /cloud
    whatsappWabaId: text('whatsapp_waba_id'), // WhatsApp Business Account ID (reconciliação / futuro multi-WABA)
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('agents_salon_idx').on(table.salonId),
    index('agents_evolution_instance_idx').on(table.evolutionInstanceName),
    // 1 agente por número Cloud = isolamento de tenant do webhook /cloud.
    // UNIQUE PARCIAL (WHERE NOT NULL) — espelha a migration 019 (vários agentes
    // sem número são permitidos; um número não pode repetir).
    uniqueIndex('agents_whatsapp_phone_number_id_unique')
      .on(table.whatsappPhoneNumberId)
      .where(sql`whatsapp_phone_number_id IS NOT NULL`)
  ]
)

// `embeddings` removida — tabela RAG legada e MORTA (0 linhas, 0 uso de app),
// substituída por agentKnowledgeBase. O DROP físico é a migration
// supabase/migrations/018_drop_embeddings.sql (aplicar SÓ após o deploy desta remoção).

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
// TABLES - Admin Audit
// ============================================================================
// Registra toda ação administrativa feita no painel /z_admin_minhaagendaai
// (criar/editar/excluir usuário, trocar senha, ajustar créditos, etc).
// adminEmail é um snapshot — preservado mesmo se o admin for removido depois.
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    adminId: uuid('admin_id').references(() => profiles.id, { onDelete: 'set null' }),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(), // ex: 'user.create', 'credits.grant', 'user.bulk_delete'
    targetType: text('target_type'), // 'user' | 'salon'
    targetId: uuid('target_id'),
    targetLabel: text('target_label'), // email/nome do alvo (snapshot para exibição)
    details: jsonb('details'), // payload livre: { before, after, amount, ... }
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('admin_audit_logs_created_at_idx').on(table.createdAt),
    index('admin_audit_logs_target_idx').on(table.targetId),
    index('admin_audit_logs_action_idx').on(table.action)
  ]
)

// Alertas operacionais exibidos no próprio sistema (ver migration 0041).
// scope 'global' = ops (worker caído, backlog da fila); 'salon' = salão específico
// (sem créditos, instância desconectada, resposta não entregue).
export const systemAlerts = pgTable(
  'system_alerts',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    scope: text('scope').notNull(), // 'global' | 'salon'
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // ex: 'worker_down', 'out_of_credits', 'delivery_undelivered'
    severity: text('severity').notNull(), // 'critical' | 'warning'
    title: text('title').notNull(),
    detail: jsonb('detail'),
    status: text('status').default('open').notNull(), // 'open' | 'resolved'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at')
  },
  (table) => [
    index('system_alerts_scope_status_idx').on(table.scope, table.status, table.createdAt),
    index('system_alerts_salon_status_idx').on(table.salonId, table.status)
  ]
)

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
  agents: many(agents),
  systemPromptTemplates: many(systemPromptTemplates)
}))

export const salonIntegrationsRelations = relations(salonIntegrations, ({ one }) => ({
  salon: one(salons, { fields: [salonIntegrations.salonId], references: [salons.id] })
}))

export const googleCalendarSyncChannelsRelations = relations(googleCalendarSyncChannels, ({ one }) => ({
  salon: one(salons, { fields: [googleCalendarSyncChannels.salonId], references: [salons.id] }),
  professional: one(professionals, { fields: [googleCalendarSyncChannels.professionalId], references: [professionals.id] })
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
  client: one(customers, { fields: [appointments.clientId], references: [customers.id] }),
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
  agent: one(agents, { fields: [chats.agentId], references: [agents.id] }),
  kanbanColumn: one(chatKanbanColumns, { fields: [chats.kanbanColumnId], references: [chatKanbanColumns.id] }),
  messages: many(messages)
}))

export const chatKanbanColumnsRelations = relations(chatKanbanColumns, ({ one, many }) => ({
  salon: one(salons, { fields: [chatKanbanColumns.salonId], references: [salons.id] }),
  chats: many(chats)
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] })
}))

// chatMessagesRelations removed (obsolete)

export const customersRelations = relations(customers, ({ one, many }) => ({
  salon: one(salons, { fields: [customers.salonId], references: [salons.id] }),
  trinksProfile: one(customerTrinksProfile, {
    fields: [customers.id],
    references: [customerTrinksProfile.customerId]
  }),
  tagAssignments: many(customerTagAssignments)
}))

export const customerTagsRelations = relations(customerTags, ({ one, many }) => ({
  salon: one(salons, { fields: [customerTags.salonId], references: [salons.id] }),
  assignments: many(customerTagAssignments)
}))

export const customerTagAssignmentsRelations = relations(customerTagAssignments, ({ one }) => ({
  customer: one(customers, { fields: [customerTagAssignments.customerId], references: [customers.id] }),
  tag: one(customerTags, { fields: [customerTagAssignments.tagId], references: [customerTags.id] }),
  salon: one(salons, { fields: [customerTagAssignments.salonId], references: [salons.id] })
}))

export const customerTrinksProfileRelations = relations(customerTrinksProfile, ({ one }) => ({
  customer: one(customers, { fields: [customerTrinksProfile.customerId], references: [customers.id] }),
  salon: one(salons, { fields: [customerTrinksProfile.salonId], references: [salons.id] })
}))

export const agentsRelations = relations(agents, ({ one, many }) => ({
  salon: one(salons, { fields: [agents.salonId], references: [salons.id] }),
  chats: many(chats),
  knowledgeBase: many(agentKnowledgeBase)
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
  profile: one(profiles, { fields: [campaignMessages.profileId], references: [profiles.id] }),
  recoveryStep: one(recoverySteps, { fields: [campaignMessages.recoveryStepId], references: [recoverySteps.id] })
}))

export const retentionResponseAuditRelations = relations(retentionResponseAudit, ({ one }) => ({
  salon: one(salons, { fields: [retentionResponseAudit.salonId], references: [salons.id] }),
  customer: one(customers, { fields: [retentionResponseAudit.customerId], references: [customers.id] }),
  campaignMessage: one(campaignMessages, { fields: [retentionResponseAudit.retentionCampaignMessageId], references: [campaignMessages.id] })
}))
