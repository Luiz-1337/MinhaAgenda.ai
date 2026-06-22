-- Add sync_status enum and column to appointments table
CREATE TYPE "sync_status" AS ENUM ('pending', 'synced', 'failed');

-- Add syncStatus column to appointments table with default 'pending'
ALTER TABLE "appointments" ADD COLUMN "sync_status" "sync_status" DEFAULT 'pending' NOT NULL;
