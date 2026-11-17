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

import type { LeadSource } from './domain/constants'

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
// 'no_show' (underscore) — grafia decidida na migration 026 e IRREVERSÍVEL
// (Postgres não tem ALTER TYPE ... DROP VALUE).
export const statusEnum = pgEnum('status', ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
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
    // slug DEPRECADO (jul/2026): nullable, não gerado nem lido pelo app. Coluna e UNIQUE
    // mantidos (MCP/seeds ainda usam; nulls não conflitam no UNIQUE). Ver migration 023.
    slug: text('slug').unique(),
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
    // Minutos de silêncio do humano após os quais a IA reassume o chat sozinha.
    // NULL = nunca retomar, que é o comportamento histórico (só o botão do painel
    // devolvia a conversa). CHECK 5..20160 (5min a 14 dias) na migration 024.
    aiResumeAfterMinutes: integer('ai_resume_after_minutes'),
    // Fechar sozinho os atendimentos passados que o balcão esqueceu (migration 027).
    // Default false de propósito: fechar automaticamente um serviço cujo preço de
    // catálogo é faixa ou "sob avaliação" gravaria receita errada, e relatório
    // errado destrói a confiança mais rápido que relatório ausente. O caminho
    // sempre-ligado é o selo de pendências na agenda.
    autoCloseAppointments: boolean('auto_close_appointments').default(false).notNull(),
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
    // Custo fixo do serviço por atendimento (migration 049): o que não vale a pena
    // controlar no estoque. Entra no custo que pode abater a comissão.
    additionalCost: numeric('additional_cost', { precision: 12, scale: 2 }).default('0').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('services_salon_idx').on(table.salonId)
  ]
)

/** Unidade de consumo de um produto fracionado. */
export type ProductContentUnit = 'ml' | 'g' | 'un'

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Controle de estoque (migration 045). O SALDO não está aqui: é a soma de
    // stock_movements.quantity. Regra em domain/inventory.ts.
    trackStock: boolean('track_stock').default(false).notNull(),
    // Abaixo disto o produto entra na sugestão de compra.
    minStock: numeric('min_stock', { precision: 12, scale: 3 }).default('0').notNull(),
    // Custo de compra. A entrada com custo informado atualiza este valor.
    costPrice: numeric('cost_price', { precision: 12, scale: 2 }),
    sku: text('sku'),
    barcode: text('barcode'),
    // Marca e categoria (migration 046). SET NULL: apagar a marca não apaga o produto.
    brandId: uuid('brand_id').references(() => productBrands.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => productCategories.id, { onDelete: 'set null' }),
    // Fracionamento (migration 048): "uma unidade equivale a" 1000 ml, 300 g…
    // Os dois andam juntos (CHECK no banco). NULL = produto não fracionado. O
    // estoque continua em UNIDADES; isto só converte o consumo do serviço.
    contentAmount: numeric('content_amount', { precision: 12, scale: 3 }),
    contentUnit: text('content_unit').$type<ProductContentUnit>(),
    // Solicitação de saída pelo profissional (migration 050): o produto pode ser
    // pedido, e por quanto. Preço NULL ou zero = sai de graça para ele.
    requestable: boolean('requestable').default(false).notNull(),
    professionalPrice: numeric('professional_price', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('products_salon_idx').on(table.salonId),
    index('products_brand_idx').on(table.brandId).where(sql`brand_id IS NOT NULL`),
    index('products_category_idx').on(table.categoryId).where(sql`category_id IS NOT NULL`)
  ]
)

// Perfil de acesso reutilizável (migration 036). `permissions` é um array de
// chaves do catálogo em domain/permissions.ts — ler SEMPRE por
// sanitizePermissionKeys, nunca confiar no formato cru do jsonb.
export const accessProfiles = pgTable(
  'access_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    permissions: jsonb('permissions').default(sql`'[]'::jsonb`).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    // Único por salão sem diferenciar maiúsculas — índice de expressão da migration 036.
    uniqueIndex('access_profiles_salon_name_unique').on(table.salonId, sql`lower(${table.name})`)
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
    // Permissões (migration 036). As duas NULL = segue o papel, como sempre foi.
    // customPermissions preenchido = "Personalizado", com prioridade sobre o perfil.
    accessProfileId: uuid('access_profile_id').references(() => accessProfiles.id, { onDelete: 'set null' }),
    customPermissions: jsonb('custom_permissions'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('professionals_salon_idx').on(table.salonId),
    index('professionals_user_idx').on(table.userId),
    index('professionals_person_key_idx').on(table.personKey),
    index('professionals_access_profile_idx').on(table.accessProfileId).where(sql`access_profile_id IS NOT NULL`)
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
    // --- Desfecho do atendimento (migration 027) ---------------------------
    // O fato "atendimento realizado, com valor". Sem estas colunas não existe
    // LTV, ticket médio, taxa de retorno nem no-show — o sistema não sabia que
    // um atendimento tinha acontecido.
    completedAt: timestamp('completed_at'),
    noShowAt: timestamp('no_show_at'),
    // Cancelamento é SOFT: a linha fica, com quando/por quê/por quem.
    cancelledAt: timestamp('cancelled_at'),
    cancelReason: text('cancel_reason'),
    cancelledBy: uuid('cancelled_by').references(() => profiles.id, { onDelete: 'set null' }),
    // Valor efetivamente cobrado. NÃO é services.price (faixa/sob avaliação/0 em
    // ~30% do catálogo, e editar o catálogo mudaria o histórico).
    // numeric → o driver devolve STRING. Nunca fazer aritmética direto.
    // CHECK no banco: status='completed' exige este campo não-nulo.
    priceCharged: numeric('price_charged', { precision: 10, scale: 2 }),
    // 'panel' | 'cron' | 'ai' | 'google' | 'legacy'
    outcomeSource: text('outcome_source'),
    // Origem do lead (migration 035): cópia de customers.lead_source NO MOMENTO da
    // criação. O que foi marcado antes de a cliente clicar num anúncio continua
    // 'organic'. NULL = não se sabe. CHECK no banco.
    leadSource: text('lead_source').$type<LeadSource>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('appt_salon_date_idx').on(table.salonId, table.date),
    index('appt_client_idx').on(table.clientId),
    index('appt_google_event_idx').on(table.googleEventId),
    index('appt_trinks_event_idx').on(table.trinksEventId),
    index('appt_prof_time_idx').on(table.professionalId, table.date, table.endTime),
    index('appt_service_idx').on(table.serviceId),
    index('appt_salon_status_date_idx').on(table.salonId, table.status, table.date)
    // appt_open_past_idx é PARCIAL (WHERE status IN ('pending','confirmed')) e vive
    // só na migration 027 — o schema do Drizzle não expressa índice parcial, e
    // declará-lo aqui sem o predicado faria `db:generate` propor recriá-lo cheio.
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

// De-para entre IDs locais e IDs de um sistema externo (migration 034). Primeiro
// uso: a agenda oficial do salão (Belasis) — profissional, serviço, cliente e
// agendamento daqui ↔ os de lá. Uma tabela só, em vez de uma coluna `<provider>_id`
// por tabela a cada integração nova. `internal_id` é polimórfico (sem FK): aponta
// para professionals/services/customers/appointments conforme `entity_type`.
export const integrationExternalRefs = pgTable(
  'integration_external_refs',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    provider: text('provider').notNull(),
    // 'professional' | 'service' | 'customer' | 'appointment' (CHECK no banco)
    entityType: text('entity_type').notNull(),
    internalId: uuid('internal_id').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('integration_external_refs_internal_unique').on(
      table.salonId, table.provider, table.entityType, table.internalId
    ),
    uniqueIndex('integration_external_refs_external_unique').on(
      table.salonId, table.provider, table.entityType, table.externalId
    )
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
    // Quando o modo manual começou (NULL = automático) e o que o ligou. Sem isso
    // `is_manual` é um booleano sem história: 3 caminhos o ligam e só o botão do
    // painel o desliga, então um chat que virou manual por falha de entrega ficava
    // parado para sempre. É a base da retomada automática por tempo.
    manualSince: timestamp('manual_since'),
    manualReason: text('manual_reason').$type<
      'human_echo' | 'panel' | 'ai_exhausted' | 'delivery_failed'
    >(),
    firstUserMessageAt: timestamp('first_user_message_at'),
    firstAgentResponseAt: timestamp('first_agent_response_at'),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    lastBotMessageRequiresResponse: boolean('last_bot_message_requires_response')
      .default(false)
      .notNull(),
    kanbanColumnId: uuid('kanban_column_id').references(() => chatKanbanColumns.id, { onDelete: 'set null' }),
    kanbanPosition: numeric('kanban_position', { precision: 20, scale: 10 }),
    // Relógio da CONVERSA: sempre igual a max(messages.created_at) do chat.
    // NÃO é escrito pela aplicação — o trigger `messages_touch_chat_last_message_at`
    // (migration 028) carimba no INSERT da mensagem, só para frente. Escrever daqui
    // é recriar exatamente o defeito que a coluna existe para matar.
    //
    // `updatedAt` abaixo é o relógio da LINHA e não serve para ordenar conversa:
    // mover cartão no kanban, ligar modo manual ou atribuir agente o mexem sem
    // que ninguém tenha falado nada.
    // NULL = chat sem nenhuma mensagem (não aparece na lista nem no board).
    lastMessageAt: timestamp('last_message_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('chats_salon_status_idx').on(table.salonId, table.status),
    index('chats_agent_idx').on(table.agentId),
    index('chats_kanban_idx').on(table.salonId, table.kanbanColumnId),
    // FK chats.kanban_column_id (o composto acima começa por salonId) — HIG-4
    index('chats_kanban_column_idx').on(table.kanbanColumnId),
    // Parcial (WHERE is_manual = true) na migration 024 — o Drizzle não expressa
    // índice parcial aqui, então a definição real vive no SQL.
    index('chats_manual_since_idx').on(table.manualSince),
    // Serve a lista de conversas e o board do kanban, que ordenam por
    // last_message_at DESC dentro de um salão (migration 028).
    index('chats_salon_last_message_idx').on(table.salonId, table.lastMessageAt.desc()),
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
    // Parte dos tokens de entrada que veio do cache de prompt da OpenAI (migration
    // 032). Conta 1/10 no crédito do salão (ver calculateCredits). NULL = 0.
    cachedTokens: integer('cached_tokens'),
    // O que o RAG do Treinamento fez nesta resposta (migration 033): corte, teto e
    // os itens mais parecidos com a nota de semelhança, entrando ou não. Só ids e
    // notas, nunca o conteúdo. Base para calibrar o corte. NULL = sem Treinamento.
    ragContext: jsonb('rag_context'),
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
    // role='assistant' cobre DOIS emissores: a IA e o humano (eco do app do
    // WhatsApp Business, ou envio manual do painel). Sem distinguir, a IA relê a
    // fala do humano como se fosse dela quando reassume a conversa.
    fromHuman: boolean('from_human').default(false).notNull(),
    // Origem de anúncio (Click-to-WhatsApp) da mensagem que a carregou — ver
    // migration 031 e o tipo AdReferral em lib/services/messaging/cloud/content.ts.
    // NULL na esmagadora maioria: a Meta só manda `referral` na primeira mensagem
    // de uma conversa nascida de anúncio/post. Sem $type<AdReferral> de propósito:
    // o tipo vive na app e o pacote db não deve importar de apps/web.
    adReferral: jsonb('ad_referral'),
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
    // O nome foi informado por uma PESSOA (migration 035)? NULL = veio do perfil do
    // WhatsApp ou é provisório ("Sil", "💤", "Novo Cliente (11)"). Preenchido quando
    // a própria cliente informa (tool updateCustomerName), alguém digita no painel
    // ou o cadastro vem da agenda oficial. Com agenda oficial ativa, a IA só cria
    // cadastro lá com nome confirmado — ver customer-agenda-name.service.ts.
    nameConfirmedAt: timestamp('name_confirmed_at'),
    // Origem do lead (migration 035). 'paid_traffic' = a conversa nasceu de clique em
    // anúncio (messages.ad_referral); 'organic' = o resto do canal oficial; NULL =
    // canal que não entrega a origem. Só sobe de 'organic' para 'paid_traffic'.
    leadSource: text('lead_source').$type<LeadSource>(),
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

/**
 * Notas de atendimento sobre o cliente, com AUTOR e DATA (migration 029).
 *
 * Substitui `customers.preferences->>'notes'`, que era um campo único
 * SOBRESCRITO a cada edição, sem autor, sem data e sem histórico — e que dividia
 * o mesmo jsonb com as chaves que a IA grava (favoriteProfessional, allergies),
 * então salvar a nota pela tela com o campo vazio apagava o que o agente havia
 * aprendido.
 *
 * Nota é registro de atendimento, não configuração: "pediu para não usar secador",
 * "veio reclamando do corte anterior". Precisa acumular.
 */
export const customerNotes = pgTable(
  'customer_notes',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
    // SET NULL: a nota é do salão, não de quem digitou. Funcionário sai (e
    // admin/users.ts apaga o profile), a informação sobre o cliente fica.
    authorProfileId: uuid('author_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('customer_notes_customer_idx').on(table.customerId, table.createdAt.desc()),
    index('customer_notes_salon_idx').on(table.salonId, table.createdAt.desc())
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
// TABLES - Comandas (migration 037)
// ============================================================================
// Dinheiro é numeric → o driver devolve STRING. Toda conta passa por
// domain/sales.ts, em centavos inteiros. Nunca somar direto.

// --- Financeiro (migration 038) — contas e categorias ------------------------
// Declaradas aqui em cima porque paymentMethods aponta para a conta de destino.
export type FinancialAccountKind = 'bank' | 'cash' | 'safe' | 'other'
export type FinancialCategoryKind = 'income' | 'expense'

export const financialAccounts = pgTable(
  'financial_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<FinancialAccountKind>().notNull(),
    // Saldo com que a conta entra no sistema. O saldo atual é este valor mais as
    // transações PAGAS — nunca é gravado, sempre calculado.
    openingBalance: numeric('opening_balance', { precision: 12, scale: 2 }).default('0').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('financial_accounts_salon_name_unique').on(table.salonId, sql`lower(${table.name})`)
  ]
)

export const financialCategories = pgTable(
  'financial_categories',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<FinancialCategoryKind>().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('financial_categories_salon_kind_name_unique').on(table.salonId, table.kind, sql`lower(${table.name})`)
  ]
)

export type PaymentMethodKind = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'other'
export type SaleStatus = 'open' | 'invoiced' | 'void'
/** 'package' = venda de pacote predefinido (fase 5, migration 051). */
export type SaleItemKind = 'service' | 'product' | 'package'

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<PaymentMethodKind>().notNull(),
    // Taxa cobrada do salão (%) e prazo de recebimento (dias). São COPIADOS para
    // sale_payments no faturamento — mudar aqui não reescreve venda passada.
    feePercent: numeric('fee_percent', { precision: 5, scale: 2 }).default('0').notNull(),
    settlementDays: integer('settlement_days').default(0).notNull(),
    // Conta de destino (migration 038): onde o dinheiro desta forma cai. NULL = não
    // configurada — a venda entra no financeiro "sem conta".
    accountId: uuid('account_id').references(() => financialAccounts.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('payment_methods_salon_name_unique').on(table.salonId, sql`lower(${table.name})`),
    index('payment_methods_account_idx').on(table.accountId).where(sql`account_id IS NOT NULL`)
  ]
)

// Numeração sequencial por salão. Incrementado por upsert com a linha travada —
// nunca max()+1, que duplica número sob concorrência.
export const saleCounters = pgTable('sale_counters', {
  salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).primaryKey().notNull(),
  lastNumber: integer('last_number').default(0).notNull()
})

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    number: integer('number').notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    // open = Pendente · invoiced = Finalizado · void = Excluída (exclusão lógica)
    status: text('status').$type<SaleStatus>().default('open').notNull(),
    saleDate: timestamp('sale_date').defaultNow().notNull(),
    notes: text('notes'),
    // Recalculados no servidor a cada gravação; o que o cliente envia é só entrada.
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).default('0').notNull(),
    discountTotal: numeric('discount_total', { precision: 12, scale: 2 }).default('0').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).default('0').notNull(),
    // Débito do cliente (migration 040): quanto da comanda FATURADA ainda não foi
    // pago. Mantido pelo código, na transação de cada pagamento: total − pagamentos.
    // CHECK no banco: 0 ≤ amount_due ≤ total, e só comanda faturada deve.
    amountDue: numeric('amount_due', { precision: 12, scale: 2 }).default('0').notNull(),
    // Quando a cliente combinou de pagar ("YYYY-MM-DD"). Só com valor em aberto.
    debtDueDate: date('debt_due_date'),
    invoicedAt: timestamp('invoiced_at'),
    invoicedBy: uuid('invoiced_by').references(() => profiles.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at'),
    voidedBy: uuid('voided_by').references(() => profiles.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('sales_salon_number_unique').on(table.salonId, table.number),
    index('sales_salon_date_idx').on(table.salonId, table.saleDate.desc()),
    index('sales_salon_status_idx').on(table.salonId, table.status, table.saleDate.desc()),
    index('sales_customer_idx').on(table.customerId),
    index('sales_debt_idx').on(table.salonId, table.customerId).where(sql`status = 'invoiced' AND amount_due > 0`)
  ]
)

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }).notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    position: integer('position').default(0).notNull(),
    kind: text('kind').$type<SaleItemKind>().notNull(),
    serviceId: uuid('service_id').references(() => services.id),
    productId: uuid('product_id').references(() => products.id),
    // Cópia do nome no momento da venda: renomear o serviço não muda o histórico.
    description: text('description').notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id),
    // Quem auxiliou no serviço (migration 042). Só em item de serviço, e nunca o
    // mesmo profissional que executou (CHECK no banco).
    assistantId: uuid('assistant_id').references(() => professionals.id),
    quantity: numeric('quantity', { precision: 10, scale: 3 }).default('1').notNull(),
    // NULL enquanto aberta = preço ainda não informado (faixa / sob avaliação).
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).default('0').notNull(),
    // Um agendamento entra em no máximo uma comanda (índice único parcial).
    appointmentId: uuid('appointment_id').references(() => appointments.id),
    // Só em item de pacote (migration 051, CHECK no banco). Sem ON DELETE: modelo
    // vendido não se apaga.
    packageTemplateId: uuid('package_template_id').references(() => packageTemplates.id),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('sale_items_sale_idx').on(table.saleId, table.position),
    index('sale_items_salon_idx').on(table.salonId),
    index('sale_items_professional_idx').on(table.professionalId).where(sql`professional_id IS NOT NULL`),
    index('sale_items_assistant_idx').on(table.assistantId).where(sql`assistant_id IS NOT NULL`),
    uniqueIndex('sale_items_appointment_unique').on(table.appointmentId).where(sql`appointment_id IS NOT NULL`),
    index('sale_items_package_template_idx')
      .on(table.packageTemplateId)
      .where(sql`package_template_id IS NOT NULL`)
  ]
)

export const salePayments = pgTable(
  'sale_payments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }).notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    feePercent: numeric('fee_percent', { precision: 5, scale: 2 }).default('0').notNull(),
    feeAmount: numeric('fee_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    settlesOn: date('settles_on').notNull(),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('sale_payments_sale_idx').on(table.saleId),
    index('sale_payments_salon_idx').on(table.salonId, table.paidAt.desc()),
    index('sale_payments_method_idx').on(table.paymentMethodId)
  ]
)

// ============================================================================
// TABLES - Financeiro (migration 038) — transações
// ============================================================================
// Contas a receber e a pagar, e transferências entre contas. Toda conta de dinheiro
// passa por domain/finance.ts, em centavos inteiros.

export type FinancialDirection = 'in' | 'out'
export type FinancialTransactionKind = 'sale' | 'manual' | 'transfer' | 'commission' | 'purchase'
export type FinancialTransactionStatus = 'open' | 'paid'

export const financialTransactions = pgTable(
  'financial_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    direction: text('direction').$type<FinancialDirection>().notNull(),
    // sale = gerada pelo faturamento de uma comanda · manual = lançada na tela ·
    // transfer = uma das duas pernas de uma transferência entre contas ·
    // commission = saída gerada por um pagamento de comissão ou por um vale ·
    // purchase = parcela a pagar gerada por uma compra de produtos
    kind: text('kind').$type<FinancialTransactionKind>().notNull(),
    // open = a receber / a pagar · paid = baixada (paid_at preenchido — CHECK no banco)
    status: text('status').$type<FinancialTransactionStatus>().default('open').notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    feeAmount: numeric('fee_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    // amount − fee_amount, gravado (CHECK no banco). É o que entra no saldo.
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    // Datas de calendário em Brasília ("YYYY-MM-DD"), sem hora.
    dueDate: date('due_date').notNull(),
    competenceDate: date('competence_date').notNull(),
    paidAt: timestamp('paid_at'),
    accountId: uuid('account_id').references(() => financialAccounts.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => financialCategories.id, { onDelete: 'set null' }),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'set null' }),
    // Fornecedor ou outra parte sem cadastro (texto livre).
    counterparty: text('counterparty'),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }),
    // CASCADE de propósito: reabrir a comanda apaga os pagamentos, e o que eles
    // geraram no financeiro some junto.
    salePaymentId: uuid('sale_payment_id').references(() => salePayments.id, { onDelete: 'cascade' }),
    // As duas pernas de uma transferência compartilham este id.
    transferGroup: uuid('transfer_group'),
    // Saída de comissão (migration 044): exatamente um dos dois quando kind é
    // 'commission' (CHECK no banco). CASCADE de propósito: estornar o pagamento ou
    // excluir o vale apaga a despesa que ele gerou.
    commissionPaymentId: uuid('commission_payment_id').references(() => commissionPayments.id, { onDelete: 'cascade' }),
    commissionAdjustmentId: uuid('commission_adjustment_id').references(() => commissionAdjustments.id, {
      onDelete: 'cascade'
    }),
    // Parcela de compra (migration 046): preenchido só quando kind é 'purchase'
    // (CHECK no banco). CASCADE de propósito: excluir a compra apaga as parcelas —
    // por isso o serviço barra a exclusão quando alguma já foi paga.
    purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('financial_transactions_purchase_idx').on(table.purchaseId).where(sql`purchase_id IS NOT NULL`),
    index('financial_transactions_salon_due_idx').on(table.salonId, table.dueDate),
    index('financial_transactions_salon_status_due_idx').on(table.salonId, table.status, table.dueDate),
    index('financial_transactions_account_paid_idx').on(table.accountId).where(sql`status = 'paid' AND account_id IS NOT NULL`),
    index('financial_transactions_sale_idx').on(table.saleId).where(sql`sale_id IS NOT NULL`),
    uniqueIndex('financial_transactions_sale_payment_unique').on(table.salePaymentId).where(sql`sale_payment_id IS NOT NULL`),
    index('financial_transactions_transfer_idx').on(table.transferGroup).where(sql`transfer_group IS NOT NULL`),
    uniqueIndex('financial_transactions_commission_payment_unique')
      .on(table.commissionPaymentId)
      .where(sql`commission_payment_id IS NOT NULL`),
    uniqueIndex('financial_transactions_commission_adjustment_unique')
      .on(table.commissionAdjustmentId)
      .where(sql`commission_adjustment_id IS NOT NULL`)
  ]
)

// ============================================================================
// TABLES - Caixa (migration 039)
// ============================================================================
// O dinheiro vivo da gaveta: quem abriu, o que entrou e saiu, e como fechou. É
// controle de operação, separado das contas financeiras. Regra em domain/cash.ts.

export type CashSessionStatus = 'open' | 'closed'
export type CashMovementKind = 'supply' | 'withdrawal' | 'sale'

export const cashSessions = pgTable(
  'cash_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').$type<CashSessionStatus>().default('open').notNull(),
    openedBy: uuid('opened_by').references(() => profiles.id, { onDelete: 'set null' }),
    openedAt: timestamp('opened_at').defaultNow().notNull(),
    openingAmount: numeric('opening_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    closedBy: uuid('closed_by').references(() => profiles.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at'),
    // Gravados SÓ no fechamento (CHECK no banco). Com o caixa aberto, o esperado é
    // sempre calculado a partir dos movimentos.
    expectedAmount: numeric('expected_amount', { precision: 12, scale: 2 }),
    countedAmount: numeric('counted_amount', { precision: 12, scale: 2 }),
    // contado − esperado: positivo é sobra, negativo é falta.
    difference: numeric('difference', { precision: 12, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    // Um caixa aberto por salão.
    uniqueIndex('cash_sessions_one_open_per_salon').on(table.salonId).where(sql`status = 'open'`),
    index('cash_sessions_salon_opened_idx').on(table.salonId, table.openedAt.desc())
  ]
)

export const cashMovements = pgTable(
  'cash_movements',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    cashSessionId: uuid('cash_session_id').references(() => cashSessions.id, { onDelete: 'cascade' }).notNull(),
    // supply = suprimento · withdrawal = sangria · sale = venda em dinheiro (entra
    // sozinha pelo faturamento da comanda)
    kind: text('kind').$type<CashMovementKind>().notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description'),
    // CASCADE de propósito: reabrir a comanda apaga o pagamento, e a entrada dele
    // no caixa some junto.
    salePaymentId: uuid('sale_payment_id').references(() => salePayments.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('cash_movements_session_idx').on(table.cashSessionId, table.createdAt),
    index('cash_movements_salon_idx').on(table.salonId),
    uniqueIndex('cash_movements_sale_payment_unique').on(table.salePaymentId).where(sql`sale_payment_id IS NOT NULL`)
  ]
)

// ============================================================================
// TABLES - Comissões (migration 041)
// ============================================================================
// Quanto de cada item vendido é do profissional. Regras em commission_settings e
// commission_rules; o extrato calculado em commission_entries. Regra pura em
// domain/commissions.ts.

/** 'competence' = disponível no dia da comanda; 'availability' = quando o salão recebe. */
export type CommissionDateBasis = 'competence' | 'availability'
/** Quem arca (com a taxa ou com o desconto): na proporção da comissão, o salão, o profissional ou meio a meio. */
export type CommissionShareMode = 'proportional' | 'salon' | 'professional' | 'split'
export type CommissionRateKind = 'percent' | 'fixed'
export type CommissionRole = 'professional' | 'assistant'
/** Sobre o que incide o percentual do auxiliar: o valor do serviço ou a comissão do profissional. */
export type CommissionAssistantBase = 'gross' | 'commission'
/** De quem sai a comissão do auxiliar. */
export type CommissionAssistantDeduct = 'salon' | 'professional'
/** 'advance' = vale (abate o que há a receber); 'bonus' = bonificação (soma). */
export type CommissionAdjustmentKind = 'advance' | 'bonus'

export const commissionSettings = pgTable(
  'commission_settings',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    // NULL = regra do salão. Preenchido = exceção daquele profissional.
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }),
    // NULL em qualquer das três = segue o salão (ou o padrão do sistema).
    dateBasis: text('date_basis').$type<CommissionDateBasis>(),
    feeMode: text('fee_mode').$type<CommissionShareMode>(),
    discountMode: text('discount_mode').$type<CommissionShareMode>(),
    // Quem arca com o custo do atendimento (migration 049).
    costMode: text('cost_mode').$type<CommissionShareMode>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('commission_settings_salon_unique').on(table.salonId).where(sql`professional_id IS NULL`),
    uniqueIndex('commission_settings_professional_unique')
      .on(table.professionalId)
      .where(sql`professional_id IS NOT NULL`),
    index('commission_settings_salon_idx').on(table.salonId)
  ]
)

export const commissionRules = pgTable(
  'commission_rules',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    // NULL = padrão do salão para o item. Preenchido = exceção do profissional.
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }),
    // Exatamente um dos dois (CHECK no banco).
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<CommissionRateKind>().notNull(),
    // 'percent': 0 a 100. 'fixed': reais por unidade.
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('commission_rules_salon_service_unique')
      .on(table.salonId, table.serviceId)
      .where(sql`professional_id IS NULL AND service_id IS NOT NULL`),
    uniqueIndex('commission_rules_salon_product_unique')
      .on(table.salonId, table.productId)
      .where(sql`professional_id IS NULL AND product_id IS NOT NULL`),
    uniqueIndex('commission_rules_professional_service_unique')
      .on(table.professionalId, table.serviceId)
      .where(sql`professional_id IS NOT NULL AND service_id IS NOT NULL`),
    uniqueIndex('commission_rules_professional_product_unique')
      .on(table.professionalId, table.productId)
      .where(sql`professional_id IS NOT NULL AND product_id IS NOT NULL`),
    index('commission_rules_salon_idx').on(table.salonId)
  ]
)

// Quanto o auxiliar ganha por serviço (migration 042). Tabela própria: as consultas
// da comissão do profissional não precisam saber que ela existe.
export const commissionAssistantRules = pgTable(
  'commission_assistant_rules',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    // NULL = padrão do salão para o serviço. Preenchido = o que aquele profissional
    // ganha quando é o auxiliar.
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
    kind: text('kind').$type<CommissionRateKind>().notNull(),
    // 'percent': 0 a 100. 'fixed': reais por unidade.
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    base: text('base').$type<CommissionAssistantBase>().default('gross').notNull(),
    deductFrom: text('deduct_from').$type<CommissionAssistantDeduct>().default('professional').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('commission_assistant_rules_salon_unique')
      .on(table.salonId, table.serviceId)
      .where(sql`professional_id IS NULL`),
    uniqueIndex('commission_assistant_rules_professional_unique')
      .on(table.professionalId, table.serviceId)
      .where(sql`professional_id IS NOT NULL`),
    index('commission_assistant_rules_salon_idx').on(table.salonId)
  ]
)

// Pagamento de comissão (migration 044): um por profissional; os feitos juntos
// compartilham `batchId`. Quita tudo o que estava em aberto até `cutoffDate`.
export const commissionPayments = pgTable(
  'commission_payments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    batchId: uuid('batch_id').notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id).notNull(),
    cutoffDate: date('cutoff_date').notNull(),
    // Fotografia do que foi quitado: o recibo não muda se algo for recalculado.
    entriesAmount: numeric('entries_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    advancesAmount: numeric('advances_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    bonusesAmount: numeric('bonuses_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    // entriesAmount − advancesAmount + bonusesAmount (CHECK no banco). Pode ser zero.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paidOn: date('paid_on').notNull(),
    // NULL = pago sem registrar no financeiro.
    accountId: uuid('account_id').references(() => financialAccounts.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('commission_payments_salon_paid_idx').on(table.salonId, table.paidOn.desc()),
    index('commission_payments_professional_idx').on(table.professionalId, table.paidOn.desc()),
    index('commission_payments_batch_idx').on(table.batchId)
  ]
)

export const commissionEntries = pgTable(
  'commission_entries',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }).notNull(),
    saleItemId: uuid('sale_item_id').references(() => saleItems.id, { onDelete: 'cascade' }).notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id).notNull(),
    role: text('role').$type<CommissionRole>().default('professional').notNull(),
    // Sobre quanto a comissão foi calculada.
    baseAmount: numeric('base_amount', { precision: 12, scale: 2 }).notNull(),
    // A regra usada, copiada: mudar a regra depois não muda o histórico.
    rateKind: text('rate_kind').$type<CommissionRateKind>().notNull(),
    rateValue: numeric('rate_value', { precision: 12, scale: 2 }).notNull(),
    // Comissão antes da taxa da forma de pagamento.
    grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
    // Parcela da taxa que coube ao profissional.
    feeAmount: numeric('fee_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    // Quanto desta comissão foi para o auxiliar (migration 042). Só na linha do
    // profissional; a do auxiliar é o que ele recebe.
    assistantDeduction: numeric('assistant_deduction', { precision: 12, scale: 2 }).default('0').notNull(),
    // Parte do custo do atendimento que saiu desta comissão (migration 049). Só na
    // linha do profissional.
    costAmount: numeric('cost_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    // O que há a receber: grossAmount − feeAmount − assistantDeduction − costAmount.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    competenceDate: date('competence_date').notNull(),
    // NULL = aguardando o cliente pagar (regra "disponibilidade" com valor em aberto).
    releaseDate: date('release_date'),
    // O pagamento que quitou esta comissão (migration 044). NULL = em aberto.
    // Comissão paga não é recalculada nem apagada.
    paymentId: uuid('payment_id').references(() => commissionPayments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('commission_entries_item_unique').on(table.saleItemId, table.professionalId, table.role),
    index('commission_entries_statement_idx').on(table.salonId, table.professionalId, table.releaseDate),
    index('commission_entries_sale_idx').on(table.saleId),
    index('commission_entries_payment_idx').on(table.paymentId).where(sql`payment_id IS NOT NULL`),
    index('commission_entries_open_idx')
      .on(table.salonId, table.professionalId, table.releaseDate)
      .where(sql`payment_id IS NULL`)
  ]
)

// Vales e bonificações (migration 043): o que entra no extrato por fora dos itens.
// Líquido = comissões a receber − vales + bonificações.
export const commissionAdjustments = pgTable(
  'commission_adjustments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id).notNull(),
    kind: text('kind').$type<CommissionAdjustmentKind>().notNull(),
    // Sempre positivo: o sinal vem de `kind`.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    // Dia em que entra no extrato (calendário de Brasília).
    referenceDate: date('reference_date').notNull(),
    notes: text('notes'),
    // O pagamento em que este lançamento entrou (migration 044). NULL = em aberto.
    paymentId: uuid('payment_id').references(() => commissionPayments.id, { onDelete: 'set null' }),
    // Débito de uma retirada de produto (migration 050): o vale aponta para a
    // solicitação que o gerou. CASCADE: excluir a solicitação apaga o débito. Só
    // 'advance' pode apontar (CHECK no banco).
    stockRequestId: uuid('stock_request_id').references(() => stockRequests.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('commission_adjustments_request_unique')
      .on(table.stockRequestId)
      .where(sql`stock_request_id IS NOT NULL`),
    index('commission_adjustments_statement_idx').on(table.salonId, table.professionalId, table.referenceDate),
    index('commission_adjustments_payment_idx').on(table.paymentId).where(sql`payment_id IS NOT NULL`),
    index('commission_adjustments_open_idx')
      .on(table.salonId, table.professionalId, table.referenceDate)
      .where(sql`payment_id IS NULL`)
  ]
)

// ============================================================================
// TABLES - Estoque (migration 045)
// ============================================================================
// Tudo o que entra e sai de um produto controlado. O saldo é a SOMA de
// `quantity` — nunca é gravado. Regra em domain/inventory.ts.

/**
 * in = entrada · out = saída · adjustment = acerto de inventário · sale = baixa por
 * comanda (produto vendido) · purchase = entrada por compra · consumption = baixa
 * de insumo por serviço faturado · request = saída por solicitação aprovada
 */
export type StockMovementKind = 'in' | 'out' | 'adjustment' | 'sale' | 'purchase' | 'consumption' | 'request'

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
    kind: text('kind').$type<StockMovementKind>().notNull(),
    // Com sinal: positivo entra, negativo sai (CHECK no banco).
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }),
    notes: text('notes'),
    // Só em 'sale' e 'consumption' (CHECK no banco). CASCADE de propósito: reabrir
    // a comanda apaga a baixa que ela fez.
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }),
    saleItemId: uuid('sale_item_id').references(() => saleItems.id, { onDelete: 'cascade' }),
    // Só em 'purchase' (migration 046, CHECK no banco). CASCADE de propósito:
    // excluir a compra apaga a entrada que ela deu.
    purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
    purchaseItemId: uuid('purchase_item_id').references(() => purchaseItems.id, { onDelete: 'cascade' }),
    // Só em 'request' (migration 050, CHECK no banco). CASCADE de propósito: excluir
    // a solicitação devolve o produto ao estoque.
    stockRequestId: uuid('stock_request_id').references(() => stockRequests.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('stock_movements_product_idx').on(table.productId, table.createdAt.desc()),
    index('stock_movements_salon_idx').on(table.salonId, table.createdAt.desc()),
    index('stock_movements_sale_idx').on(table.saleId).where(sql`sale_id IS NOT NULL`),
    // Um item de produto vendido baixa uma vez; um item de serviço consome cada
    // produto uma vez (migration 048).
    uniqueIndex('stock_movements_sale_item_unique').on(table.saleItemId).where(sql`kind = 'sale'`),
    uniqueIndex('stock_movements_consumption_unique')
      .on(table.saleItemId, table.productId)
      .where(sql`kind = 'consumption'`),
    index('stock_movements_purchase_idx').on(table.purchaseId).where(sql`purchase_id IS NOT NULL`),
    uniqueIndex('stock_movements_purchase_item_unique')
      .on(table.purchaseItemId)
      .where(sql`purchase_item_id IS NOT NULL`),
    uniqueIndex('stock_movements_request_unique')
      .on(table.stockRequestId)
      .where(sql`stock_request_id IS NOT NULL`)
  ]
)

// ============================================================================
// TABLES - Solicitações de saída de estoque (migration 050)
// ============================================================================
// O profissional pede um produto para uso próprio; o salão aprova; o produto sai
// do estoque e o valor é debitado no extrato de comissões. Regra em
// domain/stock-requests.ts.

/** pending = aguardando decisão · approved = aprovada (saiu e debitou) · rejected = recusada */
export type StockRequestStatus = 'pending' | 'approved' | 'rejected'

export const stockRequests = pgTable(
  'stock_requests',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    // Sem ON DELETE, como sale_items: produto com solicitação não se apaga.
    productId: uuid('product_id').references(() => products.id).notNull(),
    // Quem vai levar o produto, e de quem sai o débito.
    professionalId: uuid('professional_id').references(() => professionals.id).notNull(),
    // Cópia do nome e do preço para profissional na hora do pedido.
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).default('0').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    status: text('status').$type<StockRequestStatus>().default('pending').notNull(),
    notes: text('notes'),
    requestedBy: uuid('requested_by').references(() => profiles.id, { onDelete: 'set null' }),
    decidedBy: uuid('decided_by').references(() => profiles.id, { onDelete: 'set null' }),
    // NULL enquanto pendente (CHECK no banco).
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('stock_requests_salon_idx').on(table.salonId, table.createdAt.desc()),
    index('stock_requests_pending_idx').on(table.salonId, table.createdAt.desc()).where(sql`status = 'pending'`),
    index('stock_requests_professional_idx').on(table.professionalId, table.createdAt.desc()),
    index('stock_requests_product_idx').on(table.productId)
  ]
)

// ============================================================================
// TABLES - Produtos consumidos por serviço (migration 048)
// ============================================================================
// O que um atendimento gasta de cada produto. Faturar a comanda baixa o estoque
// (stock_movements.kind = 'consumption'). Regra em domain/consumption.ts.

export const serviceProducts = pgTable(
  'service_products',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
    // Na unidade de consumo do produto (ml, g), ou em unidades se não é fracionado.
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('service_products_service_product_unique').on(table.serviceId, table.productId),
    index('service_products_salon_idx').on(table.salonId),
    index('service_products_product_idx').on(table.productId)
  ]
)

// ============================================================================
// TABLES - Lotes e validades (migration 047)
// ============================================================================
// Um lote guarda o que ENTROU com ele. O que resta de cada lote não é gravado: é
// calculado a partir do saldo do produto, supondo que sai primeiro o que vence
// primeiro. Regra em domain/batches.ts.

export const productBatches = pgTable(
  'product_batches',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
    // NULL = o salão registrou só a validade (CHECK: código ou validade).
    code: text('code'),
    // Dias de calendário ("YYYY-MM-DD").
    manufacturedOn: date('manufactured_on'),
    expiresOn: date('expires_on'),
    // O que entrou com este lote.
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    notes: text('notes'),
    // A entrada (manual ou de compra) que trouxe o lote. NULL = registrado solto.
    // CASCADE de propósito: excluir a compra apaga a entrada, e o lote vai junto.
    stockMovementId: uuid('stock_movement_id').references(() => stockMovements.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('product_batches_salon_expiry_idx').on(table.salonId, table.expiresOn),
    index('product_batches_product_idx').on(table.productId, table.expiresOn),
    uniqueIndex('product_batches_movement_unique')
      .on(table.stockMovementId)
      .where(sql`stock_movement_id IS NOT NULL`)
  ]
)

// ============================================================================
// TABLES - Compras, fornecedores, marcas e categorias (migration 046)
// ============================================================================
// A compra é um documento: fornecedor, data, nota e itens. Ela dá entrada no
// estoque (stock_movements.kind = 'purchase'), atualiza o custo do produto e, com o
// financeiro ligado, gera as parcelas a pagar. Regra em domain/purchases.ts.

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    // CPF (11 dígitos) ou CNPJ (14 caracteres), sem pontuação.
    document: text('document'),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [uniqueIndex('suppliers_salon_name_unique').on(table.salonId, sql`lower(${table.name})`)]
)

export const productBrands = pgTable(
  'product_brands',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [uniqueIndex('product_brands_salon_name_unique').on(table.salonId, sql`lower(${table.name})`)]
)

export const productCategories = pgTable(
  'product_categories',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [uniqueIndex('product_categories_salon_name_unique').on(table.salonId, sql`lower(${table.name})`)]
)

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    // SET NULL só como rede: o serviço barra excluir fornecedor que tem compra.
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    // Dia de calendário em Brasília ("YYYY-MM-DD").
    purchasedOn: date('purchased_on').notNull(),
    invoiceNumber: text('invoice_number'),
    notes: text('notes'),
    itemsAmount: numeric('items_amount', { precision: 12, scale: 2 }).notNull(),
    // Frete e outros custos da nota que não são produto.
    freightAmount: numeric('freight_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    // itens + frete − desconto (CHECK no banco). É o que se paga ao fornecedor.
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('purchases_salon_date_idx').on(table.salonId, table.purchasedOn.desc(), table.createdAt.desc()),
    index('purchases_supplier_idx').on(table.supplierId).where(sql`supplier_id IS NOT NULL`)
  ]
)

export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }).notNull(),
    position: integer('position').default(0).notNull(),
    // Sem ON DELETE, como sale_items: produto com compra não se apaga.
    productId: uuid('product_id').references(() => products.id).notNull(),
    // Cópia do nome na hora da compra: renomear o produto não muda o histórico.
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    // O custo que o produto tinha antes desta compra: excluir a compra o devolve.
    previousCost: numeric('previous_cost', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('purchase_items_purchase_idx').on(table.purchaseId, table.position),
    index('purchase_items_product_idx').on(table.productId),
    index('purchase_items_salon_idx').on(table.salonId)
  ]
)

// ============================================================================
// TABLES - Pacotes (migration 051)
// ============================================================================
// Pacote predefinido (modelo) e pacote do cliente. Vender é um item da comanda
// (sale_items.kind = 'package'); faturar cria o pacote do cliente. Regra em
// domain/packages.ts.

/** O que um pacote inclui: sessões de um serviço ou unidades de um produto. */
export type PackageItemKind = 'service' | 'product'

export const packageTemplates = pgTable(
  'package_templates',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 12, scale: 2 }).default('0').notNull(),
    // Validade a partir da data da venda. NULL = não vence.
    validityDays: integer('validity_days'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [uniqueIndex('package_templates_salon_name_unique').on(table.salonId, sql`lower(${table.name})`)]
)

export const packageTemplateItems = pgTable(
  'package_template_items',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    templateId: uuid('template_id').references(() => packageTemplates.id, { onDelete: 'cascade' }).notNull(),
    position: integer('position').default(0).notNull(),
    kind: text('kind').$type<PackageItemKind>().notNull(),
    serviceId: uuid('service_id').references(() => services.id),
    productId: uuid('product_id').references(() => products.id),
    quantity: integer('quantity').notNull()
  },
  (table) => [
    index('package_template_items_template_idx').on(table.templateId, table.position),
    uniqueIndex('package_template_items_service_unique')
      .on(table.templateId, table.serviceId)
      .where(sql`service_id IS NOT NULL`),
    uniqueIndex('package_template_items_product_unique')
      .on(table.templateId, table.productId)
      .where(sql`product_id IS NOT NULL`)
  ]
)

export const customerPackages = pgTable(
  'customer_packages',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }).notNull(),
    // O item faturado que gerou o pacote (um item = um pacote).
    saleItemId: uuid('sale_item_id').references(() => saleItems.id, { onDelete: 'cascade' }).notNull(),
    templateId: uuid('template_id').references(() => packageTemplates.id).notNull(),
    // Cópia do nome do modelo na venda.
    name: text('name').notNull(),
    // Dia da comanda (Brasília) e até quando vale. NULL = não vence.
    soldOn: date('sold_on').notNull(),
    expiresOn: date('expires_on'),
    sellerId: uuid('seller_id').references(() => professionals.id),
    // O total do item da comanda.
    price: numeric('price', { precision: 12, scale: 2 }).default('0').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('customer_packages_sale_item_unique').on(table.saleItemId),
    index('customer_packages_salon_idx').on(table.salonId, table.soldOn.desc()),
    index('customer_packages_customer_idx').on(table.customerId),
    index('customer_packages_sale_idx').on(table.saleId),
    index('customer_packages_template_idx').on(table.templateId)
  ]
)

export const customerPackageItems = pgTable(
  'customer_package_items',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    customerPackageId: uuid('customer_package_id')
      .references(() => customerPackages.id, { onDelete: 'cascade' })
      .notNull(),
    position: integer('position').default(0).notNull(),
    kind: text('kind').$type<PackageItemKind>().notNull(),
    serviceId: uuid('service_id').references(() => services.id),
    productId: uuid('product_id').references(() => products.id),
    // Cópia do nome na venda.
    description: text('description').notNull(),
    quantity: integer('quantity').notNull()
  },
  (table) => [index('customer_package_items_package_idx').on(table.customerPackageId, table.position)]
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
    whatsappCloudToken: text('whatsapp_cloud_token'), // access token Cloud API do SALÃO, CIFRADO (AES-256-GCM, envelope v1:iv:tag:ct). Null => usa o token da plataforma (env). Migration 020
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
  tagAssignments: many(customerTagAssignments),
  notes: many(customerNotes)
}))

export const customerNotesRelations = relations(customerNotes, ({ one }) => ({
  customer: one(customers, { fields: [customerNotes.customerId], references: [customers.id] }),
  salon: one(salons, { fields: [customerNotes.salonId], references: [salons.id] }),
  author: one(profiles, { fields: [customerNotes.authorProfileId], references: [profiles.id] })
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
