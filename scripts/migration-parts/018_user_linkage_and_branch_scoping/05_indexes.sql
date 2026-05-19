-- Migration 018 (part 5/6): indexes (section 12)

-- -----------------------------------------------------------------------------
-- 12) Indexes
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_appt_patient;
DROP INDEX IF EXISTS idx_appt_doctor;
DROP INDEX IF EXISTS idx_appt_doctor_branch;
DROP INDEX IF EXISTS idx_appointments_org;
DROP INDEX IF EXISTS idx_payments_patient;
DROP INDEX IF EXISTS idx_encounters_patient;
DROP INDEX IF EXISTS idx_encounters_doctor;
DROP INDEX IF EXISTS idx_enc_doctor_branch;
DROP INDEX IF EXISTS idx_diagnoses_patient;
DROP INDEX IF EXISTS idx_diag_doctor_branch;
DROP INDEX IF EXISTS idx_prescriptions_patient;
DROP INDEX IF EXISTS idx_presc_doctor_branch;
DROP INDEX IF EXISTS idx_lab_orders_patient;
DROP INDEX IF EXISTS idx_lab_orders_org;
DROP INDEX IF EXISTS idx_lab_orders_doctor_branch;
DROP INDEX IF EXISTS idx_radio_orders_patient;
DROP INDEX IF EXISTS idx_radio_orders_doctor_branch;
DROP INDEX IF EXISTS idx_inv_items_org;
DROP INDEX IF EXISTS idx_inv_orders_patient;
DROP INDEX IF EXISTS idx_inv_orders_org;
DROP INDEX IF EXISTS idx_lab_slots_staff;
DROP INDEX IF EXISTS idx_lab_appt_patient;
DROP INDEX IF EXISTS idx_call_ai_notes_patient;
DROP INDEX IF EXISTS idx_call_ai_notes_doctor;
DROP INDEX IF EXISTS idx_ai_summaries_patient;
DROP INDEX IF EXISTS idx_vcr_doctor_branch;
DROP INDEX IF EXISTS idx_doc_sched_doctor_branch;

CREATE INDEX IF NOT EXISTS idx_appt_patient_user       ON appointments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_user        ON appointments(doctor_user_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_user   ON payments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_encounters_patient_user ON encounters(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor_user  ON encounters(doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_user  ON diagnoses(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_user ON prescriptions(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_user ON lab_orders(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_radio_orders_patient_user ON radiology_orders(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_branch        ON inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_patient_user ON inventory_orders(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_branch       ON inventory_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_order_by_user ON inventory_orders(order_by_doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_slots_staff_user    ON lab_slots(lab_staff_user_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_lab_appt_patient_user   ON lab_appointments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_patient_user ON call_ai_notes(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_doctor_user  ON call_ai_notes(doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_patient_user  ON ai_summaries(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_doc_sched_doctor_user_branch ON doctor_schedules(doctor_user_id, doctor_branch_id);
