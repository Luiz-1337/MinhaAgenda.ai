CREATE TYPE "public"."plan_tier" AS ENUM('SOLO', 'BUSINESS', 'EMPIRE');--> statement-breakpoint
CREATE TYPE "public"."professional_role" AS ENUM('OWNER', 'MANAGER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'PAID', 'PAST_DUE', 'CANCELED', 'TRIAL');--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "role" "professional_role" DEFAULT 'STAFF' NOT NULL;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "commission_rate" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "plan_tier" "plan_tier" DEFAULT 'SOLO' NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "subscription_status" "subscription_status" DEFAULT 'TRIAL' NOT NULL;