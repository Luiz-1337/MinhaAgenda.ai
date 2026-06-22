CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "salon_integrations" DROP CONSTRAINT "salon_integrations_salon_id_unique";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "trinks_event_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_salon_idx" ON "products" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "appt_trinks_event_idx" ON "appointments" USING btree ("trinks_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salon_integrations_salon_provider_unique" ON "salon_integrations" USING btree ("salon_id","provider");