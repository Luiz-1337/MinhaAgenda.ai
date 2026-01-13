-- Migration: Tabelas para Marketing - Fluxos de Recuperação e Campanhas
-- Cria tabelas para gerenciar fluxos de recuperação de clientes e campanhas de broadcast

-- ============================================================================
-- Tabelas de Fluxos de Recuperação
-- ============================================================================

-- Tabela principal de fluxos de recuperação
create table if not exists "public"."recovery_flows" (
  "id" uuid primary key default gen_random_uuid() not null,
  "salon_id" uuid not null references "public"."salons"("id") on delete cascade,
  "name" text not null,
  "is_active" boolean default true not null,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null
);

-- Índices para recovery_flows
create index if not exists "recovery_flows_salon_idx" on "public"."recovery_flows"("salon_id");
create index if not exists "recovery_flows_active_idx" on "public"."recovery_flows"("is_active");

-- Tabela de etapas de cada fluxo de recuperação
create table if not exists "public"."recovery_steps" (
  "id" uuid primary key default gen_random_uuid() not null,
  "recovery_flow_id" uuid not null references "public"."recovery_flows"("id") on delete cascade,
  "step_order" integer not null,
  "days_after_inactivity" integer not null,
  "message_template" text not null,
  "is_active" boolean default true not null,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null
);

-- Índices para recovery_steps
create index if not exists "recovery_steps_flow_idx" on "public"."recovery_steps"("recovery_flow_id");
create index if not exists "recovery_steps_order_idx" on "public"."recovery_steps"("recovery_flow_id", "step_order");

-- ============================================================================
-- Expansão da tabela campaigns
-- ============================================================================

-- Adicionar novos campos à tabela campaigns
alter table "public"."campaigns" 
  add column if not exists "message_template" text,
  add column if not exists "segmentation_criteria" jsonb,
  add column if not exists "include_ai_coupon" boolean default false not null,
  add column if not exists "sent_count" integer default 0 not null,
  add column if not exists "total_recipients" integer default 0 not null;

-- Índice para segmentation_criteria (se necessário para queries JSONB)
create index if not exists "campaigns_segmentation_idx" on "public"."campaigns" using gin("segmentation_criteria");

-- ============================================================================
-- Tabela de rastreamento de mensagens de campanha
-- ============================================================================

-- Tabela para rastrear cada envio individual de campanha
create table if not exists "public"."campaign_messages" (
  "id" uuid primary key default gen_random_uuid() not null,
  "campaign_id" uuid not null references "public"."campaigns"("id") on delete cascade,
  "customer_id" uuid references "public"."customers"("id") on delete set null,
  "lead_id" uuid references "public"."leads"("id") on delete set null,
  "profile_id" uuid references "public"."profiles"("id") on delete set null,
  "phone_number" text not null,
  "message_sent" text not null,
  "status" text default 'pending' not null,
  "sent_at" timestamp,
  "error_message" text,
  "created_at" timestamp default now() not null
);

-- Índices para campaign_messages
create index if not exists "campaign_messages_campaign_idx" on "public"."campaign_messages"("campaign_id");
create index if not exists "campaign_messages_status_idx" on "public"."campaign_messages"("status");
create index if not exists "campaign_messages_customer_idx" on "public"."campaign_messages"("customer_id");
create index if not exists "campaign_messages_phone_idx" on "public"."campaign_messages"("phone_number");

-- ============================================================================
-- Constraints e Validações
-- ============================================================================

-- Garantir que apenas um fluxo ativo por salão (opcional - pode ser removido se quiser múltiplos fluxos)
-- CREATE UNIQUE INDEX IF NOT EXISTS "recovery_flows_salon_active_unique" 
-- ON "public"."recovery_flows"("salon_id") 
-- WHERE "is_active" = true;

-- Garantir ordem única de steps por fluxo
create unique index if not exists "recovery_steps_flow_order_unique" 
  on "public"."recovery_steps"("recovery_flow_id", "step_order");
