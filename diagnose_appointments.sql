-- ============================================================================
-- DIAGNOSTIC SCRIPT: Check Current State of Appointments Schema
-- ============================================================================
-- Run this script to understand the current state before applying fixes
-- ============================================================================

-- 1. Check existing foreign key constraints on appointments table
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'appointments'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.constraint_name;

-- 2. Check current RLS policies on appointments table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'appointments'
ORDER BY policyname;

-- 3. Check sample appointments and their client references
SELECT
  a.id,
  a.client_id,
  CASE
    WHEN c.id IS NOT NULL THEN 'customers (✓)'
    WHEN p.id IS NOT NULL THEN 'profiles (old)'
    ELSE 'INVALID - NOT FOUND'
  END as client_reference,
  COALESCE(c.name, p.full_name, 'NOT FOUND') as client_name
FROM appointments a
LEFT JOIN customers c ON a.client_id = c.id
LEFT JOIN profiles p ON a.client_id = p.id
LIMIT 10;

-- 4. Count appointments by reference type
SELECT
  CASE
    WHEN c.id IS NOT NULL THEN 'customers table'
    WHEN p.id IS NOT NULL THEN 'profiles table'
    ELSE 'ORPHANED'
  END as reference_type,
  COUNT(*) as count
FROM appointments a
LEFT JOIN customers c ON a.client_id = c.id
LEFT JOIN profiles p ON a.client_id = p.id
GROUP BY reference_type;

-- 5. Check SOLO professionals status
SELECT
  p.id,
  p.name,
  p.user_id,
  s.owner_id,
  (p.user_id = s.owner_id) as user_id_matches_owner,
  pr.tier,
  p.is_active,
  COUNT(av.id) as availability_count
FROM professionals p
INNER JOIN salons s ON p.salon_id = s.id
INNER JOIN profiles pr ON s.owner_id = pr.id
LEFT JOIN availability av ON av.professional_id = p.id
WHERE pr.tier = 'SOLO'
GROUP BY p.id, p.name, p.user_id, s.owner_id, pr.tier, p.is_active;

-- 6. Check for appointments that would fail current JOIN
SELECT
  COUNT(*) as appointments_that_fail_current_join
FROM appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE c.id = a.client_id
);

-- Success message
DO $$
DECLARE
  fk_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) INTO fk_exists;

  RAISE NOTICE '';
  RAISE NOTICE '=== DIAGNOSTIC SUMMARY ===';
  RAISE NOTICE 'FK to customers exists: %', fk_exists;
  RAISE NOTICE '';
  RAISE NOTICE 'Review the query results above to understand current state.';
  RAISE NOTICE 'Then apply the appropriate fix migration.';
END $$;
