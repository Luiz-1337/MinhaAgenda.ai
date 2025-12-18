# SALON MANAGEMENT SAAS (WEB & MOBILE) - TECHNICAL SPECIFICATION (v2.0)

## 1. Project Overview
A multi-tenant SaaS system for the comprehensive management of barbershops and beauty salons.
- **Target Audience:** Owners (Management & Marketing), Professionals (Schedule & Operations), End Clients (Booking), and Leads (Nurturing).
- **Key Differentiators:**
    1.  **AI Agent (Chatbot):** Acts as a receptionist (scheduling) and SDR (lead nurturing) via WhatsApp and Web.
    2.  **Smart CRM:** Client history isolation per salon and automated marketing campaigns.
    3.  **Bi-directional Sync:** Deep integration with Google Calendar.

## 2. Tech Stack (Strict Types)
- **Package Manager:** pnpm
- **Monorepo:** Turborepo
- **Mobile:** React Native (Expo SDK 50+), Expo Router, NativeWind (Tailwind).
- **Web:** Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui.
- **Backend/DB:** Supabase (PostgreSQL, Auth, Storage, Realtime).
- **ORM:** **Drizzle ORM** (Schema defined in `packages/db`).
- **AI:** Vercel AI SDK, OpenAI Provider (GPT-4o mini for speed).
- **Integrations:** Google Calendar API, WhatsApp Gateway (e.g., Evolution API or Twilio).
- **Validation:** Zod (schema validation).
- **Data Fetching:** TanStack Query.

## 3. Data Structure (Updated Database Schema)
The system is Multi-tenant (`salon_id` is mandatory for most tables). The schema has been expanded to support Contextual AI and CRM.

### Core Entities:
1.  **profiles**: Global system users (`role`: owner, professional, client).
2.  **salons**: Tenant Entity. Contains `slug`, `owner_id`.
3.  **services**: Catalog (`duration`, `price`, `description`).
4.  **professionals**: Profile-Salon Link (`user_id`, `salon_id`, `email`, `is_active`).
5.  **availability**: Schedule rules (`day_of_week`, `start_time`, `end_time`, `is_break`).

### Operation & Integration Entities:
6.  **appointments**:
    - New fields: `google_event_id` (sync), `notes`.
    - Relations: salon, professional, client, service.
7.  **integrations**:
    - Stores OAuth tokens.
    - Fields: `provider` (google), `access_token`, `refresh_token`, `expires_at`, `professional_id`.

### AI & CRM Entities (New):
8.  **conversations**:
    - Chat session.
    - Fields: `channel` (whatsapp), `external_id` (phone), `interaction_status` (lead scoring).
9.  **messages**:
    - History for RAG (Retrieval Augmented Generation).
    - Fields: `role` (user/assistant/system), `content`, `metadata` (JSONB).
10. **salon_customers**:
    - Salon-specific CRM (distinct from global profile).
    - Fields: `preferences` (JSONB - e.g., "likes coffee"), `birthday`, `marketing_opt_in`.
11. **leads**:
    - Unregistered users who contacted the salon.
    - Fields: `phone_number`, `status` (new, cold), `source`.
12. **campaigns** & **campaign_recipients**:
    - Management of bulk messaging and nurturing flows.

## 4. Critical Business Logic
1.  **Hybrid Schedule Conflict Prevention:** Before booking, check:
    - (A) Internal `appointments` table.
    - (B) Google Calendar API (if the professional has an active integration).
2.  **Data Isolation (CRM):** Chat history and preference notes (`salon_customers`) belong to the **Salon**, not the User. Salon A cannot see that the client prefers "sparkling water" at Salon B.
3.  **Lead-to-Client Flow:** When a `lead` (phone only) makes their first booking and creates an account (`profile`), data must be migrated/linked to `salon_customers`.
4.  **Token Refresh:** Middleware must check `expires_at` in the `integrations` table and automatically refresh the Google token before any API calls.

## 5. AI Agent Specifications
The agent must possess **memory** (reading `messages` table) and **action capabilities** (Tools).

### Context (System Prompt):
- Must inject: Salon Data, Available Services, Recent Conversation History, and Client Preferences (`salon_customers.preferences`).

### Mandatory Tools:
1.  `checkAvailability(salonId, professionalId, date)`: Checks Internal DB + Google Calendar.
2.  `createAppointment(...)`: Creates in DB + Creates in GCalendar + Updates conversation status.
3.  `cancelAppointment(...)`: Removes from DB + Removes from GCalendar.
4.  `getServices(salonId)`: Queries `services` table.
5.  `saveCustomerPreference(customerId, key, value)`: Extracts info from chat (e.g., "allergic to ammonia") and saves to JSONB in `salon_customers`.

## 6. Development Guidelines (Cursor Rules)
- **JSONB:** Use JSONB columns (`metadata`, `preferences`) for flexible data extracted by AI, avoiding constant schema migrations.
- **Drizzle Relations:** Always keep the `relations` file updated when creating new tables to facilitate `db.query` operations with `with: {...}`.
- **Indexes:** Add indexes to frequently queried columns: `conversations.phone_number`, `appointments.date`, `leads.status`.
- **Zod Schemas:** Create unified Zod schemas that serve both for API validation and AI Tool Typing.

## 7. Roadmap Status

- [x] **1. Database Schema Definition (Drizzle + PostgreSQL)**
    - Core, CRM, Integrations, and AI tables defined.
- [ ] **2. Monorepo & Infra Setup**
    - Configure Turborepo, Supabase, and Drizzle Kit.
- [ ] **3. Authentication & Profiles Layer**
    - Implement Login, Sign-up, and automatic `profiles` creation.
- [ ] **4. Admin CRUD (Owner)**
    - Management of Salons, Professionals, and Services.
- [ ] **5. Integration Module (Google)**
    - OAuth flow for professionals to connect their calendars.
- [ ] **6. Scheduling Engine**
    - Logic for free slots and conflict prevention.
- [ ] **7. AI Backend (Chat)**
    - Endpoints for webhooks (WhatsApp) and message processing.
    - Implementation of AI Tools.
- [ ] **8. User Interface (Web & Mobile)**
    - Dashboards and visual booking flow.