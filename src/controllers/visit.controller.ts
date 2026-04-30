import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

// POST /encounters  – open a clinical encounter
export const createVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      appointment_id, patient_id, doctor_id, encounter_type,
      chief_complaint, history_of_present_illness,
    } = req.body;

    if (appointment_id) {
      await query(
        `UPDATE appointments SET status = 'in_progress' WHERE id = $1`,
        [appointment_id],
      );
    }

    const result = await query(
      `INSERT INTO encounters (appointment_id, patient_id, doctor_id, encounter_type,
       chief_complaint, history_of_present_illness)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [appointment_id, patient_id, doctor_id, encounter_type,
       chief_complaint, history_of_present_illness],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /encounters/:id
export const getVisitById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT e.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name
       FROM encounters e
       JOIN patients p ON p.id = e.patient_id
       JOIN doctors doc ON doc.id = e.doctor_id
       JOIN users u ON u.id = doc.user_id
       WHERE e.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Encounter not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /encounters/:id  – update clinical notes / complete encounter
export const updateVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      chief_complaint, history_of_present_illness, physical_examination,
      assessment, plan, follow_up_date, status,
    } = req.body;

    const result = await query(
      `UPDATE encounters
       SET chief_complaint=$1, history_of_present_illness=$2, physical_examination=$3,
           assessment=$4, plan=$5, follow_up_date=$6, status=$7
       WHERE id = $8 RETURNING *`,
      [chief_complaint, history_of_present_illness, physical_examination,
       assessment, plan, follow_up_date, status, req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Encounter not found' });
      return;
    }

    if (status === 'completed') {
      await query(
        `UPDATE appointments SET status = 'completed'
         WHERE id = (SELECT appointment_id FROM encounters WHERE id = $1) AND appointment_id IS NOT NULL`,
        [req.params.id],
      );
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /encounters/:id/vitals
export const recordVitalSigns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      patient_id, temperature, blood_pressure_systolic, blood_pressure_diastolic,
      heart_rate, respiratory_rate, oxygen_saturation, weight, height, bmi,
      blood_glucose, pain_scale, notes,
    } = req.body;

    const recordedBy = (req as Request & { user?: { userId: number } }).user?.userId;

    const result = await query(
      `INSERT INTO vitals
         (encounter_id, patient_id, recorded_by, temperature, blood_pressure_systolic,
          blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation,
          weight, height, bmi, blood_glucose, pain_scale, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.params.id, patient_id, recordedBy, temperature, blood_pressure_systolic,
       blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation,
       weight, height, bmi, blood_glucose, pain_scale, notes],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /encounters/:id/diagnoses
export const addDiagnosis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patient_id, doctor_id, icd_code, diagnosis_text, diagnosis_type, notes } = req.body;

    const result = await query(
      `INSERT INTO diagnoses (encounter_id, patient_id, doctor_id, icd_code, diagnosis_text, diagnosis_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, patient_id, doctor_id, icd_code, diagnosis_text, diagnosis_type, notes],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /encounters/:id/diagnoses
export const getVisitDiagnoses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM diagnoses WHERE encounter_id = $1 ORDER BY created_at ASC`,
      [req.params.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// POST /encounters/:id/clinical-notes
export const addClinicalNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { note_type, content } = req.body;
    const doctorId = (req as Request & { user?: { userId: number } }).user?.userId;

    const result = await query(
      `INSERT INTO clinical_notes (encounter_id, doctor_id, note_type, content)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, doctorId, note_type, content],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /encounters/:id/vitals
export const getEncounterVitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM vitals WHERE encounter_id = $1 ORDER BY recorded_at ASC`,
      [req.params.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─── API 5 ──────────────────────────────────────────────────────────────────
// GET /encounters/:id/full  – complete encounter with all related data
export const getEncounterFull = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const encounterId = req.params.id;

    const encounterRes = await query(
      `SELECT e.*,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
              d.specialization AS doctor_specialization,
              dept.name AS department_name
       FROM encounters e
       JOIN doctors d ON d.id = e.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = (
           SELECT department_id FROM appointments WHERE id = e.appointment_id LIMIT 1
       )
       WHERE e.id = $1`,
      [encounterId],
    );

    if (encounterRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Encounter not found' });
      return;
    }

    const [
      clinicalNotesRes,
      diagnosesRes,
      vitalsRes,
      prescriptionsRes,
      labOrdersRes,
      radiologyOrdersRes,
    ] = await Promise.all([
      query(
        `SELECT cn.*, CONCAT(u.first_name,' ',u.last_name) AS author_name
         FROM clinical_notes cn
         JOIN users u ON u.id = cn.doctor_id
         WHERE cn.encounter_id = $1
         ORDER BY cn.created_at ASC`,
        [encounterId],
      ),
      query(
        `SELECT diag.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM diagnoses diag
         JOIN doctors d ON d.id = diag.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         WHERE diag.encounter_id = $1
         ORDER BY diag.diagnosed_date ASC`,
        [encounterId],
      ),
      query(
        `SELECT v.*, CONCAT(u.first_name,' ',u.last_name) AS recorded_by_name
         FROM vitals v
         LEFT JOIN users u ON u.id = v.recorded_by
         WHERE v.encounter_id = $1
         ORDER BY v.recorded_at ASC`,
        [encounterId],
      ),
      query(
        `SELECT p.id, p.prescription_date, p.valid_until, p.status, p.notes,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',              pi.id,
                    'medication_name', pi.medication_name,
                    'dosage',          pi.dosage,
                    'frequency',       pi.frequency,
                    'duration',        pi.duration,
                    'quantity',        pi.quantity,
                    'route',           pi.route,
                    'instructions',    pi.instructions,
                    'is_dispensed',    pi.is_dispensed
                  ) ORDER BY pi.id
                ) FILTER (WHERE pi.id IS NOT NULL) AS items
         FROM prescriptions p
         JOIN doctors d ON d.id = p.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
         WHERE p.encounter_id = $1
         GROUP BY p.id, u.first_name, u.last_name`,
        [encounterId],
      ),
      query(
        `SELECT lo.id, lo.order_date, lo.priority, lo.status, lo.clinical_notes,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',             loi.id,
                    'test_name',      ltc.name,
                    'test_code',      ltc.code,
                    'category',       ltc.category,
                    'status',         loi.status,
                    'result_value',   loi.result_value,
                    'unit',           loi.unit,
                    'normal_range',   loi.normal_range,
                    'interpretation', loi.interpretation,
                    'result_notes',   loi.result_notes,
                    'result_date',    loi.result_date
                  ) ORDER BY loi.id
                ) FILTER (WHERE loi.id IS NOT NULL) AS tests
         FROM lab_orders lo
         LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE lo.encounter_id = $1
         GROUP BY lo.id`,
        [encounterId],
      ),
      query(
        `SELECT ro.id, ro.order_date, ro.priority, ro.status, ro.clinical_notes,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',             roi.id,
                    'test_name',      rtc.name,
                    'modality',       rtc.modality,
                    'status',         roi.status,
                    'findings',       roi.findings,
                    'impression',     roi.impression,
                    'recommendation', roi.recommendation,
                    'image_url',      roi.image_url,
                    'report_date',    roi.report_date
                  ) ORDER BY roi.id
                ) FILTER (WHERE roi.id IS NOT NULL) AS scans
         FROM radiology_orders ro
         LEFT JOIN radiology_order_items roi ON roi.radiology_order_id = ro.id
         LEFT JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE ro.encounter_id = $1
         GROUP BY ro.id`,
        [encounterId],
      ),
    ]);

    res.json({
      success: true,
      data: {
        encounter: {
          ...encounterRes.rows[0],
          clinical_notes:   clinicalNotesRes.rows,
          diagnoses:        diagnosesRes.rows,
          vitals:           vitalsRes.rows,
          prescriptions:    prescriptionsRes.rows,
          lab_orders:       labOrdersRes.rows,
          radiology_orders: radiologyOrdersRes.rows,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Smart Encounter ─────────────────────────────────────────────────────────
// GET /encounters/:id/smart?fields=chief_complaint,diagnosis,bp,...
//
// Extracts requested field values from three sources (in priority order):
//   1. call_ai_notes.structured_data   (real-time AI notes, doctor-only)
//   2. ai_summaries.structured_data    (post-call summary, summary_type='call')
//   3. clinical_notes.content          (raw text from doctor, returned as-is)
//
// Response per field: { value: string, source: 'ai_notes'|'call_summary'|null }
// Also returns raw text from call summary + doctor notes for full context.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Shared logic for smart field extraction — works from either encounter or
// appointment context.  Called by both:
//   GET /encounters/:id/smart
//   GET /appointments/:id/smart
// ─────────────────────────────────────────────────────────────────────────────
async function runSmartQuery(
  res: Response,
  next: NextFunction,
  appointmentId: number | null,
  encounterId: number | null,
  requestedFields: string[],
): Promise<void> {
  try {
    // Resolve the other ID if only one is supplied
    let resolvedEncounterId   = encounterId;
    let resolvedAppointmentId = appointmentId;
    let patientId: number | null = null;
    let doctorId: number | null  = null;

    if (encounterId) {
      const encRes = await query(
        `SELECT id, appointment_id, patient_id, doctor_id FROM encounters WHERE id = $1`,
        [encounterId],
      );
      if (encRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Encounter not found' });
        return;
      }
      resolvedAppointmentId = encRes.rows[0].appointment_id;
      patientId = encRes.rows[0].patient_id;
      doctorId  = encRes.rows[0].doctor_id;
    } else if (appointmentId) {
      const apptRes = await query(
        `SELECT a.id, a.patient_id, a.doctor_id,
                e.id AS encounter_id
         FROM appointments a
         LEFT JOIN encounters e ON e.appointment_id = a.id
         WHERE a.id = $1
         ORDER BY e.created_at DESC
         LIMIT 1`,
        [appointmentId],
      );
      if (apptRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Appointment not found' });
        return;
      }
      patientId            = apptRes.rows[0].patient_id;
      doctorId             = apptRes.rows[0].doctor_id;
      resolvedEncounterId  = apptRes.rows[0].encounter_id ?? null;
    } else {
      res.status(400).json({ success: false, message: 'encounter_id or appointment_id is required' });
      return;
    }

    // Fetch all data sources in parallel
    const [aiNotesRes, callSummaryRes, doctorNotesRes] = await Promise.all([
      query(
        `SELECT structured_data, content, note_type, created_at
         FROM call_ai_notes
         WHERE appointment_id = $1
         ORDER BY
           CASE note_type WHEN 'final' THEN 1 WHEN 'interim' THEN 2 ELSE 3 END,
           created_at DESC`,
        [resolvedAppointmentId],
      ),
      query(
        `SELECT structured_data, content, created_at
         FROM ai_summaries
         WHERE appointment_id = $1 AND summary_type = 'call'
         ORDER BY created_at DESC
         LIMIT 1`,
        [resolvedAppointmentId],
      ),
      resolvedEncounterId
        ? query(
            `SELECT content, note_type, created_at
             FROM clinical_notes
             WHERE encounter_id = $1
             ORDER BY created_at DESC`,
            [resolvedEncounterId],
          )
        : Promise.resolve({ rows: [] as { content: string }[] }),
    ]);

    // Merge structured_data (priority: final > interim > realtime)
    const aiStructured: Record<string, string> = {};
    for (const row of [...aiNotesRes.rows].reverse()) {
      if (row.structured_data && typeof row.structured_data === 'object') {
        Object.assign(aiStructured, row.structured_data);
      }
    }
    const summaryStructured: Record<string, string> =
      callSummaryRes.rows[0]?.structured_data ?? {};

    // Extract requested fields
    const fields: Record<string, { value: string; source: string | null }> = {};
    for (const field of requestedFields) {
      const fromAiNotes = aiStructured[field] ?? aiStructured[field.toLowerCase()];
      const fromSummary = summaryStructured[field] ?? summaryStructured[field.toLowerCase()];

      if (fromAiNotes !== undefined && fromAiNotes !== null && String(fromAiNotes).trim() !== '') {
        fields[field] = { value: String(fromAiNotes), source: 'ai_notes' };
      } else if (fromSummary !== undefined && fromSummary !== null && String(fromSummary).trim() !== '') {
        fields[field] = { value: String(fromSummary), source: 'call_summary' };
      } else {
        fields[field] = { value: '', source: null };
      }
    }

    res.json({
      success: true,
      data: {
        encounter_id:     resolvedEncounterId,
        appointment_id:   resolvedAppointmentId,
        patient_id:       patientId,
        doctor_id:        doctorId,
        fields,
        call_summary_raw: callSummaryRes.rows[0]?.content ?? null,
        doctor_notes_raw: (doctorNotesRes.rows as { content: string }[]).map(r => r.content).join('\n\n') || null,
        ai_notes_raw:     aiNotesRes.rows.map(r => r.content).filter(Boolean).join('\n\n') || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /encounters/:id/smart?fields=...
export const getEncounterSmart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const requestedFields = ((req.query.fields as string) || '')
    .split(',').map(f => f.trim()).filter(Boolean);
  await runSmartQuery(res, next, null, Number(req.params.id), requestedFields);
};

// GET /appointments/:id/smart?fields=...
// Works BEFORE an encounter exists — only appointment_id is needed
export const getAppointmentSmart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const requestedFields = ((req.query.fields as string) || '')
    .split(',').map(f => f.trim()).filter(Boolean);
  await runSmartQuery(res, next, Number(req.params.id), null, requestedFields);
};

