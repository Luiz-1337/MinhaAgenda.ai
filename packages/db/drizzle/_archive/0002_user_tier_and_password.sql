CREATE TYPE "public"."user_tier" AS ENUM('standard', 'advanced', 'professional');
ALTER TABLE "profiles" ADD COLUMN "user_tier" "user_tier";
ALTER TABLE "profiles" ADD COLUMN "password_hash" text DEFAULT 'seed' NOT NULL;
ALTER TABLE "profiles" DROP COLUMN "role";
DROP TYPE "public"."role";
