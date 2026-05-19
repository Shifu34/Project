-- Migration 018 (part 2/6): backfill patient_user_id and doctor_user_id (section 7)

-- -----------------------------------------------------------------------------
-- 7) Backfill patient_user_id + doctor_user_id
-- -----------------------------------------------------------------------------
UPDATE appointments a
SET patient_user_id = p.user_id
FROM patients p
WHERE a.patient_user_id = p.id;

UPDATE encounters e
SET patient_user_id = p.user_id
FROM patients p
WHERE e.patient_user_id = p.id;

UPDATE diagnoses d
SET patient_user_id = p.user_id
FROM patients p
WHERE d.patient_user_id = p.id;

UPDATE prescriptions p
SET patient_user_id = pat.user_id
FROM patients pat
WHERE p.patient_user_id = pat.id;

UPDATE lab_orders lo
SET patient_user_id = p.user_id
FROM patients p
WHERE lo.patient_user_id = p.id;

UPDATE radiology_orders ro
SET patient_user_id = p.user_id
FROM patients p
WHERE ro.patient_user_id = p.id;

UPDATE medical_reports mr
SET patient_user_id = p.user_id
FROM patients p
WHERE mr.patient_user_id = p.id;

UPDATE call_ai_notes cn
SET patient_user_id = p.user_id
FROM patients p
WHERE cn.patient_user_id = p.id;

UPDATE ai_summaries s
SET patient_user_id = p.user_id
FROM patients p
WHERE s.patient_user_id = p.id;

UPDATE video_call_rooms v
SET patient_user_id = p.user_id
FROM patients p
WHERE v.patient_user_id = p.id;

UPDATE payments pay
SET patient_user_id = p.user_id
FROM patients p
WHERE pay.patient_user_id = p.id;

UPDATE vitals v
SET patient_user_id = p.user_id
FROM patients p
WHERE v.patient_user_id = p.id;

UPDATE user_insurances ui
SET patient_user_id = p.user_id
FROM patients p
WHERE ui.patient_user_id = p.id;

UPDATE inventory_orders io
SET patient_user_id = p.user_id
FROM patients p
WHERE io.patient_user_id = p.id;

UPDATE lab_appointments la
SET patient_user_id = p.user_id
FROM patients p
WHERE la.patient_user_id = p.id;

-- doctor_user_id from doctors (uses doctor_branch_id if present)
UPDATE appointments a
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = a.doctor_user_id
  AND (a.doctor_branch_id IS NULL OR d.branch_id = a.doctor_branch_id);

UPDATE encounters e
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = e.doctor_user_id
  AND (e.doctor_branch_id IS NULL OR d.branch_id = e.doctor_branch_id);

UPDATE diagnoses dg
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = dg.doctor_user_id
  AND (dg.doctor_branch_id IS NULL OR d.branch_id = dg.doctor_branch_id);

UPDATE prescriptions pr
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = pr.doctor_user_id
  AND (pr.doctor_branch_id IS NULL OR d.branch_id = pr.doctor_branch_id);

UPDATE lab_orders lo
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = lo.doctor_user_id
  AND (lo.doctor_branch_id IS NULL OR d.branch_id = lo.doctor_branch_id);

UPDATE radiology_orders ro
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = ro.doctor_user_id
  AND (ro.doctor_branch_id IS NULL OR d.branch_id = ro.doctor_branch_id);

UPDATE medical_reports mr
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = mr.doctor_user_id
  AND (mr.doctor_branch_id IS NULL OR d.branch_id = mr.doctor_branch_id);

UPDATE call_ai_notes cn
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = cn.doctor_user_id
  AND (cn.doctor_branch_id IS NULL OR d.branch_id = cn.doctor_branch_id);

UPDATE ai_summaries s
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = s.doctor_user_id
  AND (s.doctor_branch_id IS NULL OR d.branch_id = s.doctor_branch_id);

UPDATE video_call_rooms v
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = v.doctor_user_id
  AND (v.doctor_branch_id IS NULL OR d.branch_id = v.doctor_branch_id);
