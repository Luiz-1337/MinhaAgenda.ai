CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."chat_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TABLE "agent_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"total_credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"date" date NOT NULL,
	"model" text NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"client_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"client_phone" text NOT NULL,
	"status" "chat_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "conversations" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_profile_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "role" SET DATA TYPE "public"."chat_message_role" USING "role"::text::"public"."chat_message_role";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "chat_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tool_calls" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "google_access_token" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "google_refresh_token" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "calendar_sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "work_hours" jsonb;--> statement-breakpoint
ALTER TABLE "agent_stats" ADD CONSTRAINT "agent_stats_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_stats" ADD CONSTRAINT "ai_usage_stats_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_client_id_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_stats_salon_agent_idx" ON "agent_stats" USING btree ("salon_id","agent_name");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_stats_salon_agent_unique" ON "agent_stats" USING btree ("salon_id","agent_name");--> statement-breakpoint
CREATE INDEX "ai_usage_salon_date_idx" ON "ai_usage_stats" USING btree ("salon_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_salon_date_model_unique" ON "ai_usage_stats" USING btree ("salon_id","date","model");--> statement-breakpoint
CREATE INDEX "chat_messages_salon_client_idx" ON "chat_messages" USING btree ("salon_id","client_id");--> statement-breakpoint
CREATE INDEX "chat_messages_salon_created_idx" ON "chat_messages" USING btree ("salon_id","created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_prof_day_idx" ON "availability" USING btree ("professional_id","day_of_week");--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "conversation_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "sender_profile_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "metadata";--> statement-breakpoint
DROP TYPE "public"."channel";--> statement-breakpoint
DROP TYPE "public"."message_role";