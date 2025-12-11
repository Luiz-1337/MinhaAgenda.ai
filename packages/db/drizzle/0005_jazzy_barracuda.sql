CREATE TABLE "salon_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"expires_at" bigint,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salon_integrations_salon_id_unique" UNIQUE("salon_id")
);
--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "service_ids" jsonb;--> statement-breakpoint
ALTER TABLE "salon_integrations" ADD CONSTRAINT "salon_integrations_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "salon_integrations_salon_idx" ON "salon_integrations" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "appt_service_idx" ON "appointments" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "chats_salon_status_idx" ON "chats" USING btree ("salon_id","status");--> statement-breakpoint
CREATE INDEX "professionals_salon_idx" ON "professionals" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "professionals_user_idx" ON "professionals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "salon_customers_salon_profile_idx" ON "salon_customers" USING btree ("salon_id","profile_id");--> statement-breakpoint
CREATE INDEX "salon_customers_salon_idx" ON "salon_customers" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "salon_owner_idx" ON "salons" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "services_salon_idx" ON "services" USING btree ("salon_id");