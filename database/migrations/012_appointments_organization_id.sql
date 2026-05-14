-- Migration 012: Backfill organization_id on appointments from doctor → user → organization_id
--                and ensure the column exists with DEFAULT 1

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL DEFAULT 1;

-- Backfill from the doctor's linked user
UPDATE appointments a
SET organization_id = u.organization_id
FROM doctors d
JOIN users u ON u.id = d.user_id
WHERE d.id = a.doctor_id
  AND u.organization_id IS NOT NULL;

-- Any remaining NULLs → 1
UPDATE appointments SET organization_id = 1 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments (organization_id);
