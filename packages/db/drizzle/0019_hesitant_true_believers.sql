CREATE TYPE "public"."whatsapp_template_category" AS ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "campaign_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"customer_id" uuid,
	"profile_id" uuid,
	"phone_number" text NOT NULL,
	"message_sent" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recovery_flow_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"days_after_inactivity" integer NOT NULL,
	"message_template" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'pt_BR' NOT NULL,
	"category" "whatsapp_template_category" NOT NULL,
	"body" text NOT NULL,
	"header" text,
	"footer" text,
	"buttons" jsonb,
	"status" "whatsapp_template_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_client_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "whatsapp_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "whatsapp_status" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "whatsapp_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "whatsapp_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "message_template" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "segmentation_criteria" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "include_ai_coupon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "total_recipients" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_bot_message_requires_response" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "requires_response" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_integrations" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "evolution_instance_name" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "evolution_instance_token" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "evolution_connection_status" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "evolution_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price_type" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price_min" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price_max" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_flows" ADD CONSTRAINT "recovery_flows_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_steps" ADD CONSTRAINT "recovery_steps_recovery_flow_id_recovery_flows_id_fk" FOREIGN KEY ("recovery_flow_id") REFERENCES "public"."recovery_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_messages_campaign_idx" ON "campaign_messages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_messages_status_idx" ON "campaign_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_messages_customer_idx" ON "campaign_messages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "campaign_messages_phone_idx" ON "campaign_messages" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "recovery_flows_salon_idx" ON "recovery_flows" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "recovery_flows_active_idx" ON "recovery_flows" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "recovery_steps_flow_idx" ON "recovery_steps" USING btree ("recovery_flow_id");--> statement-breakpoint
CREATE INDEX "recovery_steps_order_idx" ON "recovery_steps" USING btree ("recovery_flow_id","step_order");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_steps_flow_order_unique" ON "recovery_steps" USING btree ("recovery_flow_id","step_order");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_salon_idx" ON "whatsapp_templates" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_status_idx" ON "whatsapp_templates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_salon_name_unique" ON "whatsapp_templates" USING btree ("salon_id","name");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_customers_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;