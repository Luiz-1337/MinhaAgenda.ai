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

-- Log results
DO $$
DECLARE
  affected_count integer;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled availability for % SOLO professionals', affected_count / 5;
END $$;
