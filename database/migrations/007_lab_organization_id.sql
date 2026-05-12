-- Migration 007: Add organization_id to lab_slots and lab_appointments

ALTER TABLE lab_slots
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE lab_appointments
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- Backfill slots: inherit from the staff member's profile
UPDATE lab_slots ls
SET organization_id = lsp.organization_id
FROM lab_staff_profiles lsp
WHERE lsp.id = ls.lab_staff_id
  AND ls.organization_id IS NULL
  AND lsp.organization_id IS NOT NULL;

-- Backfill appointments: inherit from their slot
UPDATE lab_appointments la
SET organization_id = ls.organization_id
FROM lab_slots ls
WHERE ls.id = la.lab_slot_id
  AND la.organization_id IS NULL
  AND ls.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_slots_org ON lab_slots (organization_id);
CREATE INDEX IF NOT EXISTS idx_lab_appt_org  ON lab_appointments (organization_id);
