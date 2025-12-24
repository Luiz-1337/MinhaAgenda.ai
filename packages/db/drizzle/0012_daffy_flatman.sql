ALTER TABLE "salons" ALTER COLUMN "plan_tier" SET DATA TYPE text;--> statement-breakpoint
UPDATE "salons" SET "plan_tier" = 'PRO' WHERE "plan_tier" = 'BUSINESS';--> statement-breakpoint
UPDATE "salons" SET "plan_tier" = 'ENTERPRISE' WHERE "plan_tier" = 'EMPIRE';--> statement-breakpoint
ALTER TABLE "salons" ALTER COLUMN "plan_tier" SET DEFAULT 'SOLO'::text;--> statement-breakpoint
DROP TYPE "public"."plan_tier";--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('SOLO', 'PRO', 'ENTERPRISE');--> statement-breakpoint
ALTER TABLE "salons" ALTER COLUMN "plan_tier" SET DEFAULT 'SOLO'::"public"."plan_tier";--> statement-breakpoint
ALTER TABLE "salons" ALTER COLUMN "plan_tier" SET DATA TYPE "public"."plan_tier" USING "plan_tier"::"public"."plan_tier";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
UPDATE "profiles" SET "tier" = 'SOLO' WHERE "tier" = 'FREE';--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "tier" SET DEFAULT 'SOLO'::text;--> statement-breakpoint
DROP TYPE "public"."subscription_tier";--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('SOLO', 'PRO', 'ENTERPRISE');--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "tier" SET DEFAULT 'SOLO'::"public"."subscription_tier";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "tier" SET DATA TYPE "public"."subscription_tier" USING "tier"::"public"."subscription_tier";