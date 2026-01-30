-- ============================================================================
-- COMPREHENSIVE FIX FOR APPOINTMENTS NOT SHOWING IN SOLO PROFESSIONAL SCHEDULE
-- VERSION 2: Handles cases where constraints already exist
-- ============================================================================
-- This script applies all necessary migrations and data fixes
-- Execute this in Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- ============================================================================
-- PHASE 0: DIAGNOSTIC (Optional - shows current state)
-- ============================================================================
DO $$
DECLARE
  fk_to_customers boolean;
  fk_to_profiles boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) INTO fk_to_customers;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_profiles_id_fk'
    AND table_name = 'appointments'
  ) INTO fk_to_profiles;

  RAISE NOTICE '=== CURRENT STATE ===';
  RAISE NOTICE 'FK to customers exists: %', fk_to_customers;
  RAISE NOTICE 'FK to profiles exists: %', fk_to_profiles;
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- PHASE 1: APPLY MIGRATION 010 - Fix RLS for Create/Update
-- ============================================================================

-- Drop and recreate INSERT policy
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

-- Drop and recreate UPDATE policy
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

-- Phase 1 complete notification
DO $$
BEGIN
  RAISE NOTICE '✓ Phase 1 complete: RLS INSERT/UPDATE policies updated';
END $$;

-- ============================================================================
-- PHASE 2: APPLY MIGRATION 012 - Fix client_id Foreign Key (CRITICAL FIX)
-- ============================================================================

-- Drop the old foreign key constraint (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_profiles_id_fk'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments DROP CONSTRAINT appointments_client_id_profiles_id_fk;
    RAISE NOTICE '✓ Dropped old FK constraint: appointments_client_id_profiles_id_fk';
  ELSE
    RAISE NOTICE 'ℹ Old FK constraint does not exist (already dropped or never existed)';
  END IF;
END $$;

-- Add the correct foreign key constraint to customers table (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_client_id_customers_id_fk
    FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE CASCADE;
    RAISE NOTICE '✓ Created new FK constraint: appointments_client_id_customers_id_fk';
  ELSE
    RAISE NOTICE 'ℹ FK constraint to customers already exists (skipping creation)';
  END IF;
END $$;

-- Update SELECT policy
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

-- Phase 2 complete notification
DO $$
BEGIN
  RAISE NOTICE '✓ Phase 2 complete: FK updated and SELECT policy fixed';
END $$;

-- ============================================================================
-- PHASE 3: APPLY MIGRATION 011 - Backfill Default Availability
-- ============================================================================

-- Insert default availability (Monday-Friday, 9:00-18:00) for SOLO professionals
INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
SELECT
  p.id as professional_id,
  dow as day_of_week,
  '09:00'::time as start_time,
  '18:00'::time as end_time,
  false as is_break
FROM professionals p
INNER JOIN salons s ON p.salon_id = s.id
INNER JOIN profiles pr ON s.owner_id = pr.id
CROSS JOIN generate_series(1, 5) dow
WHERE
  pr.tier = 'SOLO'
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM availability a
    WHERE a.professional_id = p.id
  )
ON CONFLICT DO NOTHING;

-- Count how many were added
DO $$
DECLARE
  affected_count integer;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count > 0 THEN
    RAISE NOTICE '✓ Phase 3 complete: Backfilled availability for % SOLO professional(s)', affected_count / 5;
  ELSE
    RAISE NOTICE 'ℹ Phase 3 complete: All SOLO professionals already have availability';
  END IF;
END $$;

-- ============================================================================
-- PHASE 4: FIX EDGE CASES
-- ============================================================================

-- Edge Case 1: Fix Orphaned Appointments
DO $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE appointments a
  SET professional_id = p.id
  FROM salons s
  INNER JOIN profiles pr ON s.owner_id = pr.id
  INNER JOIN professionals p ON p.salon_id = s.id AND p.user_id = s.owner_id
  WHERE a.salon_id = s.id
    AND pr.tier = 'SOLO'
    AND a.professional_id != p.id
    AND p.is_active = true;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count > 0 THEN
    RAISE NOTICE '✓ Fixed % orphaned appointment(s) in SOLO salons', updated_count;
  ELSE
    RAISE NOTICE 'ℹ No orphaned appointments found';
  END IF;
END $$;

-- Edge Case 2: Deactivate Extra Professionals in SOLO Salons
DO $$
DECLARE
  deactivated_count integer;
BEGIN
  UPDATE professionals
  SET is_active = false
  WHERE salon_id IN (
    SELECT s.id FROM salons s
    INNER JOIN profiles pr ON s.owner_id = pr.id
    WHERE pr.tier = 'SOLO'
  )
  AND user_id != (SELECT owner_id FROM salons WHERE id = professionals.salon_id);

  GET DIAGNOSTICS deactivated_count = ROW_COUNT;
  IF deactivated_count > 0 THEN
    RAISE NOTICE '✓ Deactivated % extra professional(s) in SOLO salons', deactivated_count;
  ELSE
    RAISE NOTICE 'ℹ No extra professionals found in SOLO salons';
  END IF;
END $$;

-- Phase 4 complete notification
DO $$
BEGIN
  RAISE NOTICE '✓ Phase 4 complete: Edge cases handled';
END $$;

-- ============================================================================
-- PHASE 5: VERIFICATION QUERIES
-- ============================================================================
-- Run these queries AFTER applying the migrations to verify everything is correct
-- ============================================================================

-- Verification 1: Check SOLO Professionals Have Correct user_id
SELECT
  'VERIFICATION 1: SOLO Professional user_id check' as check_name,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS: All SOLO professionals have correct user_id'
    ELSE '✗ FAIL: ' || COUNT(*) || ' SOLO professional(s) with incorrect user_id'
  END as result
FROM (
  SELECT p.id
  FROM professionals p
  INNER JOIN salons s ON p.salon_id = s.id
  INNER JOIN profiles pr ON s.owner_id = pr.id
  WHERE pr.tier = 'SOLO'
    AND p.is_active = true
    AND (p.user_id != s.owner_id OR p.user_id IS NULL)
) subquery;

-- Verification 2: Check Appointments Reference Valid Customers
SELECT
  'VERIFICATION 2: Appointments FK check' as check_name,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS: All appointments reference valid customers'
    ELSE '✗ FAIL: ' || COUNT(*) || ' appointment(s) with invalid customer reference'
  END as result
FROM appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE c.id = a.client_id
);

-- Verification 3: Check SOLO Professionals Have Availability
SELECT
  'VERIFICATION 3: SOLO availability check' as check_name,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS: All SOLO professionals have availability'
    ELSE '✗ FAIL: ' || COUNT(*) || ' SOLO professional(s) without availability'
  END as result
FROM (
  SELECT p.id
  FROM professionals p
  INNER JOIN salons s ON p.salon_id = s.id
  INNER JOIN profiles pr ON s.owner_id = pr.id
  LEFT JOIN availability av ON av.professional_id = p.id
  WHERE pr.tier = 'SOLO'
    AND p.is_active = true
  GROUP BY p.id
  HAVING COUNT(av.id) = 0
) subquery;

-- Verification 4: Check for Multiple Active Professionals in SOLO Salons
SELECT
  'VERIFICATION 4: SOLO professional count' as check_name,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS: All SOLO salons have exactly 1 active professional'
    ELSE '✗ FAIL: ' || COUNT(*) || ' SOLO salon(s) with incorrect professional count'
  END as result
FROM (
  SELECT s.id
  FROM salons s
  INNER JOIN profiles pr ON s.owner_id = pr.id
  LEFT JOIN professionals p ON p.salon_id = s.id AND p.is_active = true
  WHERE pr.tier = 'SOLO'
  GROUP BY s.id
  HAVING COUNT(p.id) != 1
) subquery;

-- Verification 5: Sample Appointments Query
SELECT
  'VERIFICATION 5: Sample appointments' as check_name,
  CASE
    WHEN COUNT(*) > 0 THEN '✓ PASS: Found ' || COUNT(*) || ' appointment(s) with proper JOINs'
    ELSE 'ℹ INFO: No recent appointments found (this may be expected)'
  END as result
FROM appointments a
INNER JOIN professionals p ON a.professional_id = p.id
INNER JOIN customers c ON a.client_id = c.id
INNER JOIN services s ON a.service_id = s.id
WHERE a.date >= NOW() - INTERVAL '30 days';

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================
DO $$
DECLARE
  fk_correct boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) INTO fk_correct;

  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '✓ ALL MIGRATIONS APPLIED SUCCESSFULLY!';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'FK to customers: %', CASE WHEN fk_correct THEN '✓ CORRECT' ELSE '✗ ERROR' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Review the verification results above.';
  RAISE NOTICE 'All verifications should show "✓ PASS"';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test appointment visibility in the UI';
  RAISE NOTICE '2. Try creating a new appointment';
  RAISE NOTICE '3. Verify appointments appear immediately';
END $$;
