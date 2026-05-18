-- Migration 016: Add doctor_branch_id to all doctor-linked tables and enforce composite FKs

-- 1) Add doctor_branch_id columns
ALTER TABLE doctor_schedules   ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE appointments       ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE encounters         ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE diagnoses          ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE prescriptions      ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE lab_orders         ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE radiology_orders   ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE video_call_rooms   ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE medical_reports    ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE call_ai_notes      ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;
ALTER TABLE ai_summaries       ADD COLUMN IF NOT EXISTS doctor_branch_id INTEGER;

-- 2) Backfill doctor_branch_id from doctors
UPDATE doctor_schedules ds
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE ds.doctor_branch_id IS NULL
  AND d.employee_id = ds.doctor_id;

UPDATE appointments a
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE a.doctor_branch_id IS NULL
  AND d.employee_id = a.doctor_id;

UPDATE encounters e
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE e.doctor_branch_id IS NULL
  AND d.employee_id = e.doctor_id;

UPDATE diagnoses diag
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE diag.doctor_branch_id IS NULL
  AND d.employee_id = diag.doctor_id;

UPDATE prescriptions p
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE p.doctor_branch_id IS NULL
  AND d.employee_id = p.doctor_id;

UPDATE lab_orders lo
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE lo.doctor_branch_id IS NULL
  AND d.employee_id = lo.doctor_id;

UPDATE radiology_orders ro
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE ro.doctor_branch_id IS NULL
  AND d.employee_id = ro.doctor_id;

UPDATE video_call_rooms vcr
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE vcr.doctor_branch_id IS NULL
  AND d.employee_id = vcr.doctor_id;

UPDATE medical_reports mr
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE mr.doctor_branch_id IS NULL
  AND d.employee_id = mr.doctor_id;

UPDATE call_ai_notes n
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE n.doctor_branch_id IS NULL
  AND d.employee_id = n.doctor_id;

UPDATE ai_summaries s
SET doctor_branch_id = d.branch_id
FROM doctors d
WHERE s.doctor_branch_id IS NULL
  AND d.employee_id = s.doctor_id;

-- 3) Enforce NOT NULL where doctor_id is required
ALTER TABLE doctor_schedules   ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE appointments       ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE encounters         ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE diagnoses          ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE prescriptions      ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE lab_orders         ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE radiology_orders   ALTER COLUMN doctor_branch_id SET NOT NULL;
ALTER TABLE video_call_rooms   ALTER COLUMN doctor_branch_id SET NOT NULL;

-- 4) Drop old doctor_id FKs (single-column)
ALTER TABLE doctor_schedules   DROP CONSTRAINT IF EXISTS doctor_schedules_doctor_id_fkey;
ALTER TABLE appointments       DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE encounters         DROP CONSTRAINT IF EXISTS encounters_doctor_id_fkey;
ALTER TABLE diagnoses          DROP CONSTRAINT IF EXISTS diagnoses_doctor_id_fkey;
ALTER TABLE prescriptions      DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
ALTER TABLE lab_orders         DROP CONSTRAINT IF EXISTS lab_orders_doctor_id_fkey;
ALTER TABLE radiology_orders   DROP CONSTRAINT IF EXISTS radiology_orders_doctor_id_fkey;
ALTER TABLE video_call_rooms   DROP CONSTRAINT IF EXISTS video_call_rooms_doctor_id_fkey;
ALTER TABLE medical_reports    DROP CONSTRAINT IF EXISTS medical_reports_doctor_id_fkey;
ALTER TABLE call_ai_notes      DROP CONSTRAINT IF EXISTS call_ai_notes_doctor_id_fkey;
ALTER TABLE ai_summaries       DROP CONSTRAINT IF EXISTS ai_summaries_doctor_id_fkey;
ALTER TABLE departments        DROP CONSTRAINT IF EXISTS fk_head_doctor;

-- 5) Drop UNIQUE(employee_id) to allow duplicates across orgs
DROP INDEX IF EXISTS doctors_employee_id_uidx;

-- 6) Add composite FKs
ALTER TABLE doctor_schedules
  ADD CONSTRAINT doctor_schedules_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id) ON DELETE CASCADE;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE encounters
  ADD CONSTRAINT encounters_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE diagnoses
  ADD CONSTRAINT diagnoses_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE radiology_orders
  ADD CONSTRAINT radiology_orders_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE video_call_rooms
  ADD CONSTRAINT video_call_rooms_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id);

ALTER TABLE medical_reports
  ADD CONSTRAINT medical_reports_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id) ON DELETE SET NULL;

ALTER TABLE call_ai_notes
  ADD CONSTRAINT call_ai_notes_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id) ON DELETE SET NULL;

ALTER TABLE ai_summaries
  ADD CONSTRAINT ai_summaries_doctor_fkey
  FOREIGN KEY (doctor_id, doctor_branch_id)
  REFERENCES doctors(employee_id, branch_id) ON DELETE SET NULL;

-- 7) Indexes for composite lookups
CREATE INDEX IF NOT EXISTS idx_doc_sched_doctor_branch ON doctor_schedules(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_branch      ON appointments(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_enc_doctor_branch       ON encounters(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_diag_doctor_branch      ON diagnoses(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_presc_doctor_branch     ON prescriptions(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor_branch ON lab_orders(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_radio_orders_doctor_branch ON radiology_orders(doctor_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_vcr_doctor_branch       ON video_call_rooms(doctor_id, doctor_branch_id);
