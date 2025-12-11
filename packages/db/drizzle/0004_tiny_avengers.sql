ALTER TABLE "salon_memberships" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "salon_memberships" CASCADE;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "salons" ADD CONSTRAINT "salons_whatsapp_unique" UNIQUE("whatsapp");