CREATE TYPE "public"."payment_method" AS ENUM('PIX', 'CARD', 'BOLETO');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'APPROVED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "agent_knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"method" "payment_method" NOT NULL,
	"receipt_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "salon_customers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "salon_customers" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_salon_id_unique";--> statement-breakpoint
ALTER TABLE "campaign_recipients" DROP CONSTRAINT "campaign_recipients_salon_customer_id_salon_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "tone" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "whatsapp_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "is_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "first_user_message_at" timestamp;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "first_agent_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "billing_postal_code" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "billing_city" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "billing_state" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "billing_country" text DEFAULT 'BR';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "billing_address_complement" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "agent_knowledge_base" ADD CONSTRAINT "agent_knowledge_base_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_knowledge_base_agent_idx" ON "agent_knowledge_base" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_external_id_idx" ON "payments" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" DROP COLUMN "salon_customer_id";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "user_tier";--> statement-breakpoint
ALTER TABLE "salons" DROP COLUMN "plan_tier";--> statement-breakpoint
DROP TYPE "public"."plan_tier";--> statement-breakpoint
DROP TYPE "public"."user_tier";