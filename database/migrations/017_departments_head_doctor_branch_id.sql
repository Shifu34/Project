-- Migration 017: Add head_doctor_branch_id to departments

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS head_doctor_branch_id INTEGER;

-- Backfill branch where possible (scoped by organization when available)
UPDATE departments d
SET head_doctor_branch_id = doc.branch_id
FROM doctors doc
WHERE d.head_doctor_branch_id IS NULL
  AND d.head_doctor_id IS NOT NULL
  AND doc.employee_id = d.head_doctor_id
  AND (d.organization_id IS NULL OR doc.organization_id = d.organization_id);

-- Enforce composite FK (head_doctor_id + head_doctor_branch_id)
ALTER TABLE departments
  DROP CONSTRAINT IF EXISTS departments_head_doctor_fkey;

ALTER TABLE departments
  ADD CONSTRAINT departments_head_doctor_fkey
  FOREIGN KEY (head_doctor_id, head_doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id)
  ON DELETE SET NULL;
