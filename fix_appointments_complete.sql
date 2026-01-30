-- ============================================================================
-- COMPREHENSIVE FIX FOR APPOINTMENTS NOT SHOWING IN SOLO PROFESSIONAL SCHEDULE
-- ============================================================================
-- This script applies all necessary migrations and data fixes
-- Execute this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PHASE 1: APPLY MIGRATION 010 - Fix RLS for Create/Update
-- ============================================================================
-- Fix RLS policy for appointments table to allow professionals to create appointments
-- This resolves the issue where salon owners (who are also professionals) cannot create
-- appointments for clients due to overly restrictive RLS policy

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can create appointments" ON appointments;

-- Create updated policy that allows:
-- 1. Clients to create their own appointments
-- 2. Salon owners to create appointments for their salon
-- 3. Active professionals to create appointments for their salon (NEW)
CREATE POLICY "Users can create appointments" ON appointments
  FOR INSERT WITH CHECK (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

-- Also update the UPDATE policy to match
DROP POLICY IF EXISTS "Users can update relevant appointments" ON appointments;

CREATE POLICY "Users can update relevant appointments" ON appointments
  FOR UPDATE USING (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

-- ============================================================================
-- PHASE 2: APPLY MIGRATION 012 - Fix client_id Foreign Key (CRITICAL FIX)
-- ============================================================================
-- Fix appointments.client_id foreign key to reference customers instead of profiles
-- This is the correct design since customers come from WhatsApp messages, not user profiles

-- Drop the old foreign key constraint
ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS appointments_client_id_profiles_id_fk;

-- Add the correct foreign key constraint to customers table
ALTER TABLE appointments
ADD CONSTRAINT appointments_client_id_customers_id_fk
FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE CASCADE;

-- Update RLS policy for appointments to work with customers instead of profiles
-- Note: customers don't have auth.uid(), so we only check salon ownership
DROP POLICY IF EXISTS "Users can create appointments" ON appointments;

CREATE POLICY "Users can create appointments" ON appointments
  FOR INSERT WITH CHECK (
    -- Salon owners can create appointments
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    -- Active professionals can create appointments for their salon
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update relevant appointments" ON appointments;

CREATE POLICY "Users can update relevant appointments" ON appointments
  FOR UPDATE USING (
    -- Salon owners can update appointments
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    -- Active professionals can update appointments for their salon
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can view relevant appointments" ON appointments;

CREATE POLICY "Users can view relevant appointments" ON appointments
  FOR SELECT USING (
    -- Salon owners can view appointments
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    -- Active professionals can view appointments for their salon
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

-- ============================================================================
-- PHASE 3: APPLY MIGRATION 011 - Backfill Default Availability
-- ============================================================================
-- Backfill default availability for existing SOLO professionals who don't have any
-- This fixes existing users who are experiencing the "no hours configured" error

-- Insert default availability (Monday-Friday, 9:00-18:00) for SOLO professionals
-- who don't have any availability records yet
INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
SELECT
  p.id as professional_id,
  dow as day_of_week,
  '09:00'::time as start_time,
  '18:00'::time as end_time,
  false as is_break
FROM professionals p
-- Join with salons to check if it's a SOLO plan
INNER JOIN salons s ON p.salon_id = s.id
INNER JOIN profiles pr ON s.owner_id = pr.id
-- Cross join with days of week (1=Monday, 5=Friday)
CROSS JOIN generate_series(1, 5) dow
WHERE
  -- Only SOLO tier salons
  pr.tier = 'SOLO'
  -- Professional is active
  AND p.is_active = true
  -- Professional doesn't have any availability records yet
  AND NOT EXISTS (
    SELECT 1 FROM availability a
    WHERE a.professional_id = p.id
  )
ON CONFLICT DO NOTHING; -- In case of race conditions

-- ============================================================================
-- PHASE 4: FIX EDGE CASES
-- ============================================================================

-- Edge Case 1: Fix Orphaned Appointments
-- Updates appointments that point to wrong professionals in SOLO salons
UPDATE appointments a
SET professional_id = p.id
FROM salons s
INNER JOIN profiles pr ON s.owner_id = pr.id
INNER JOIN professionals p ON p.salon_id = s.id AND p.user_id = s.owner_id
WHERE a.salon_id = s.id
  AND pr.tier = 'SOLO'
  AND a.professional_id != p.id
  AND p.is_active = true;

-- Edge Case 2: Deactivate Extra Professionals in SOLO Salons
-- SOLO salons should only have one active professional (the owner)
UPDATE professionals
SET is_active = false
WHERE salon_id IN (
  SELECT s.id FROM salons s
  INNER JOIN profiles pr ON s.owner_id = pr.id
  WHERE pr.tier = 'SOLO'
)
AND user_id != (SELECT owner_id FROM salons WHERE id = professionals.salon_id);

-- ============================================================================
-- PHASE 5: VERIFICATION QUERIES
-- ============================================================================
-- Run these queries AFTER applying the migrations to verify everything is correct
-- ============================================================================

-- Verification 1: Check SOLO Professionals Have Correct user_id
-- Expected: All rows should have user_id_matches_owner = true
SELECT
  p.id,
  p.name,
  p.user_id,
  s.owner_id,
  (p.user_id = s.owner_id) as user_id_matches_owner,
  pr.tier
FROM professionals p
INNER JOIN salons s ON p.salon_id = s.id
INNER JOIN profiles pr ON s.owner_id = pr.id
WHERE pr.tier = 'SOLO'
  AND p.is_active = true;

-- Verification 2: Check Appointments Reference Valid Customers
-- Expected: 0 rows (all appointments have valid customer references)
SELECT
  a.id,
  a.client_id,
  a.salon_id,
  'INVALID - NO CUSTOMER FOUND' as issue
FROM appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE c.id = a.client_id
);

-- Verification 3: Check SOLO Professionals Have Availability
-- Expected: 0 rows (all SOLO professionals have availability records)
SELECT
  p.id,
  p.name,
  s.name as salon_name,
  COUNT(av.id) as availability_count,
  'MISSING AVAILABILITY' as issue
FROM professionals p
INNER JOIN salons s ON p.salon_id = s.id
INNER JOIN profiles pr ON s.owner_id = pr.id
LEFT JOIN availability av ON av.professional_id = p.id
WHERE pr.tier = 'SOLO'
  AND p.is_active = true
GROUP BY p.id, p.name, s.name
HAVING COUNT(av.id) = 0;

-- Verification 4: Check for Multiple Active Professionals in SOLO Salons
-- Expected: 0 rows (SOLO salons should have exactly 1 active professional)
SELECT
  s.id as salon_id,
  s.name as salon_name,
  COUNT(p.id) as prof_count,
  'TOO MANY PROFESSIONALS' as issue
FROM salons s
INNER JOIN profiles pr ON s.owner_id = pr.id
LEFT JOIN professionals p ON p.salon_id = s.id AND p.is_active = true
WHERE pr.tier = 'SOLO'
GROUP BY s.id, s.name
HAVING COUNT(p.id) > 1 OR COUNT(p.id) = 0;

-- Verification 5: Sample Appointments Query
-- This simulates what the application query does
-- Expected: Should return appointments with professional and customer names
SELECT
  a.id,
  a.date,
  a.end_time,
  a.status,
  p.name as professional_name,
  c.name as customer_name,
  s.name as service_name
FROM appointments a
INNER JOIN professionals p ON a.professional_id = p.id
INNER JOIN customers c ON a.client_id = c.id
INNER JOIN services s ON a.service_id = s.id
INNER JOIN salons sal ON a.salon_id = sal.id
INNER JOIN profiles pr ON sal.owner_id = pr.id
WHERE pr.tier = 'SOLO'
  AND a.date >= NOW() - INTERVAL '7 days'
ORDER BY a.date DESC
LIMIT 10;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✓ All migrations applied successfully!';
  RAISE NOTICE '✓ Edge cases handled';
  RAISE NOTICE '✓ Run verification queries above to confirm everything is working';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Review verification query results above';
  RAISE NOTICE '2. Test appointment visibility in the UI';
  RAISE NOTICE '3. Try creating a new appointment';
END $$;
