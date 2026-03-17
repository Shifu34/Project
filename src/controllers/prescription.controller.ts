import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';

// POST /prescriptions
export const createPrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { encounter_id, patient_id, doctor_id, valid_until, notes, items } = req.body;
    // items: [{inventory_item_id?, medication_name, dosage, frequency, duration, quantity, route, instructions}]

    const prescRes = await client.query(
      `INSERT INTO prescriptions (encounter_id, patient_id, doctor_id, valid_until, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [encounter_id, patient_id, doctor_id, valid_until, notes],
    );
    const prescription = prescRes.rows[0];

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        await client.query(
          `INSERT INTO prescription_items
             (prescription_id, inventory_item_id, medication_name, dosage, frequency, duration, quantity, route, instructions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [prescription.id, item.inventory_item_id ?? null, item.medication_name,
           item.dosage, item.frequency, item.duration, item.quantity, item.route, item.instructions],
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: prescription });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /prescriptions/:id
export const getPrescriptionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [prescRes, itemsRes] = await Promise.all([
      query(
        `SELECT p.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                CONCAT(pt.first_name,' ',pt.last_name) AS patient_name, pt.patient_code
         FROM prescriptions p
         JOIN doctors d ON d.id = p.doctor_id
         JOIN users u ON u.id = d.user_id
         JOIN patients pt ON pt.id = p.patient_id
         WHERE p.id = $1`,
        [req.params.id],
      ),
      query(
        `SELECT pi.*, inv.generic_name, inv.dosage_form, inv.strength
         FROM prescription_items pi
         LEFT JOIN inventory_items inv ON inv.id = pi.inventory_item_id
         WHERE pi.prescription_id = $1`,
        [req.params.id],
      ),
    ]);

    if (prescRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Prescription not found' });
      return;
    }

    res.json({ success: true, data: { ...prescRes.rows[0], items: itemsRes.rows } });
  } catch (err) {
    next(err);
  }
};

// GET /prescriptions  – filtered list
export const getPrescriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page      = Math.max(1, parseInt(req.query.page as string || '1',  10));
    const limit     = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const patientId = req.query.patient_id as string | undefined;
    const offset    = (page - 1) * limit;

    const params: unknown[] = [limit, offset];
    const where = patientId ? `WHERE p.patient_id = $3` : '';
    if (patientId) params.push(patientId);

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT p.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                CONCAT(pt.first_name,' ',pt.last_name) AS patient_name, pt.patient_code
         FROM prescriptions p
         JOIN doctors d ON d.id = p.doctor_id
         JOIN users u ON u.id = d.user_id
         JOIN patients pt ON pt.id = p.patient_id
         ${where}
         ORDER BY p.prescription_date DESC LIMIT $1 OFFSET $2`,
        params,
      ),
      query(`SELECT COUNT(*) FROM prescriptions p ${where}`, patientId ? [patientId] : []),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};
