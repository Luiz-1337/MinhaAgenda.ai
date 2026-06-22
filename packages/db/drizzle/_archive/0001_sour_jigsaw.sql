CREATE TYPE "public"."system_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "salon_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "system_role" "system_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "salon_memberships" ADD CONSTRAINT "salon_memberships_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_memberships" ADD CONSTRAINT "salon_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_profile_salon_idx" ON "salon_memberships" USING btree ("profile_id","salon_id");