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
  uniqueIndex
} from 'drizzle-orm/pg-core'

// ============================================================================
// ENUMS
// ============================================================================
export const systemRoleEnum = pgEnum('system_role', ['admin', 'user'])
export const userTierEnum = pgEnum('user_tier', ['standard', 'advanced', 'professional'])
export const statusEnum = pgEnum('status', ['pending', 'confirmed', 'cancelled', 'completed'])
export const leadStatusEnum = pgEnum('lead_status', ['new', 'cold', 'recently_scheduled'])
export const chatStatusEnum = pgEnum('chat_status', ['active', 'completed'])
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['user', 'assistant', 'system', 'tool'])

// ============================================================================
// TABLES - User/Auth
// ============================================================================
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().notNull(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  phone: text('phone'),
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  calendarSyncEnabled: boolean('calendar_sync_enabled').default(false).notNull(),
  systemRole: systemRoleEnum('system_role').default('user').notNull(),
  userTier: userTierEnum('user_tier'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

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
    address: text('address'),
    phone: text('phone'),
    description: text('description'),
    settings: jsonb('settings'),
    workHours: jsonb('work_hours'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => {
    return {
      slugIdx: index('salon_slug_idx').on(table.slug)
    }
  }
)

export const services = pgTable('services', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  duration: integer('duration').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const professionals = pgTable('professionals', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const professionalServices = pgTable(
  'professional_services',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }).notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => {
    return {
      proServiceUnique: uniqueIndex('pro_service_unique').on(table.professionalId, table.serviceId)
    }
  }
)

export const salonMemberships = pgTable(
  'salon_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => {
    return {
      membershipIdx: index('membership_profile_salon_idx').on(table.profileId, table.salonId)
    }
  }
)

// ============================================================================
// TABLES - Scheduling
// ============================================================================
export const availability = pgTable('availability', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  professionalId: uuid('professional_id').references(() => professionals.id, { onDelete: 'cascade' }).notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  isBreak: boolean('is_break').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

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
  (table) => {
    return {
      overrideIdx: index('override_prof_time_idx').on(table.professionalId, table.startTime, table.endTime)
    }
  }
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    salonId: uuid('salon_id').references(() => salons.id).notNull(),
    professionalId: uuid('professional_id').references(() => professionals.id).notNull(),
    clientId: uuid('client_id').references(() => profiles.id).notNull(),
    serviceId: uuid('service_id').references(() => services.id).notNull(),
    date: timestamp('date').notNull(),
    endTime: timestamp('end_time').notNull(),
    status: statusEnum('status').default('pending').notNull(),
    googleEventId: text('google_event_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => {
    return {
      salonDateIdx: index('appt_salon_date_idx').on(table.salonId, table.date),
      clientIdx: index('appt_client_idx').on(table.clientId),
      googleEventIdx: index('appt_google_event_idx').on(table.googleEventId),
      profTimeIdx: index('appt_prof_time_idx').on(table.professionalId, table.date, table.endTime)
    }
  }
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

// ============================================================================
// TABLES - Chat/CRM
// ============================================================================
export const chats = pgTable('chats', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  salonId: uuid('salon_id').references(() => salons.id).notNull(),
  clientPhone: text('client_phone').notNull(),
  status: chatStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  chatId: uuid('chat_id').references(() => chats.id, { onDelete: 'cascade' }).notNull(),
  role: chatMessageRoleEnum('role').notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const salonCustomers = pgTable('salon_customers', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  salonId: uuid('salon_id').references(() => salons.id, { onDelete: 'cascade' }).notNull(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  notes: text('notes'),
  birthday: date('birthday'),
  marketingOptIn: boolean('marketing_opt_in').default(false).notNull(),
  interactionStatus: leadStatusEnum('interaction_status').default('new').notNull(),
  preferences: jsonb('preferences'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

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
  (table) => {
    return {
      statusIdx: index('lead_status_idx').on(table.status)
    }
  }
)

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  salonId: uuid('salon_id').references(() => salons.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status'),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const campaignRecipients = pgTable('campaign_recipients', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  salonCustomerId: uuid('salon_customer_id').references(() => salonCustomers.id),
  leadId: uuid('lead_id').references(() => leads.id),
  profileId: uuid('profile_id').references(() => profiles.id),
  addedAt: timestamp('added_at').defaultNow().notNull()
})

// ============================================================================
// RELATIONS
// ============================================================================
export const profilesRelations = relations(profiles, ({ many }) => ({
  appointments: many(appointments),
  ownedSalons: many(salons)
}))

export const salonsRelations = relations(salons, ({ one, many }) => ({
  owner: one(profiles, { fields: [salons.ownerId], references: [profiles.id] }),
  services: many(services),
  professionals: many(professionals),
  appointments: many(appointments),
  chats: many(chats)
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  salon: one(salons, { fields: [services.salonId], references: [salons.id] }),
  appointments: many(appointments),
  professionalServices: many(professionalServices)
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

export const salonMembershipsRelations = relations(salonMemberships, ({ one }) => ({
  salon: one(salons, { fields: [salonMemberships.salonId], references: [salons.id] }),
  user: one(profiles, { fields: [salonMemberships.profileId], references: [profiles.id] })
}))

export const chatsRelations = relations(chats, ({ one, many }) => ({
  salon: one(salons, { fields: [chats.salonId], references: [salons.id] }),
  messages: many(messages)
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] })
}))
