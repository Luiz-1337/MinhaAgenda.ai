CREATE TYPE "public"."profile_role" AS ENUM('OWNER', 'PROFESSIONAL', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('FREE', 'PRO', 'ENTERPRISE');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "role" "profile_role" DEFAULT 'CLIENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "tier" "subscription_tier" DEFAULT 'FREE' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "salon_id" uuid;