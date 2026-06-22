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

