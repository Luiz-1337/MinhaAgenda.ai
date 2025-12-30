-- Remove foreign key constraint from campaign_recipients
ALTER TABLE "campaign_recipients" DROP CONSTRAINT IF EXISTS "campaign_recipients_salon_customer_id_salon_customers_id_fk";

-- Rename salon_customer_id to customer_id in campaign_recipients
ALTER TABLE "campaign_recipients" RENAME COLUMN "salon_customer_id" TO "customer_id";

-- Add foreign key constraint to customers table
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_customer_id_customers_id_fk" 
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;

-- Drop the salon_customers table
DROP TABLE IF EXISTS "salon_customers";

