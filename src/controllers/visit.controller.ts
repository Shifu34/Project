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
