import { Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ---------------------------------------------------------------------------
// Helper: resolve lab_staff_profiles row from user_id
// ---------------------------------------------------------------------------
async function resolveLabStaff(userId: number): Promise<{ id: number; organization_id: number | null } | null> {
  const res = await query(`SELECT id, organization_id FROM lab_staff_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// GET /lab/slots
// lab_staff  → their own slots
// patient    → active future slots (for booking)
// admin      → all slots
// ---------------------------------------------------------------------------
export const getLabSlots = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, roleName } = req.user!;

    const orgFilter = req.query.organization_id ? Number(req.query.organization_id) : null;

    let rows;
    if (roleName === 'lab_staff') {
      const staff = await resolveLabStaff(userId);
      if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }
      const result = await query(
        `SELECT ls.*, lsp.name AS staff_name, ltc.name AS test_name, o.name AS organization_name
         FROM lab_slots ls
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = ls.test_id
         LEFT JOIN organizations o ON o.id = ls.organization_id
         WHERE ls.lab_staff_id = $1
         ORDER BY ls.slot_date, ls.slot_time`,
        [staff.id],
      );
      rows = result.rows;
    } else if (roleName === 'patient') {
      const params: unknown[] = [];
      let orgWhere = '';
      if (orgFilter) { params.push(orgFilter); orgWhere = `AND ls.organization_id = $${params.length}`; }
      const result = await query(
        `SELECT ls.*, lsp.name AS staff_name, ltc.name AS test_name, o.name AS organization_name,
                (ls.max_bookings - COUNT(la.id)) AS remaining_bookings
         FROM lab_slots ls
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = ls.test_id
         LEFT JOIN organizations o ON o.id = ls.organization_id
         LEFT JOIN lab_appointments la
           ON la.lab_slot_id = ls.id AND la.status NOT IN ('cancelled')
         WHERE ls.is_active = true AND ls.slot_date >= CURRENT_DATE ${orgWhere}
         GROUP BY ls.id, lsp.name, ltc.name, o.name
         HAVING (ls.max_bookings - COUNT(la.id)) > 0
         ORDER BY ls.slot_date, ls.slot_time`,
        params,
      );
      rows = result.rows;
    } else {
      // admin: all slots, optional org filter
      const params: unknown[] = [];
      let orgWhere = '';
      if (orgFilter) { params.push(orgFilter); orgWhere = `WHERE ls.organization_id = $${params.length}`; }
      const result = await query(
        `SELECT ls.*, lsp.name AS staff_name, ltc.name AS test_name, o.name AS organization_name
         FROM lab_slots ls
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = ls.test_id
         LEFT JOIN organizations o ON o.id = ls.organization_id
         ${orgWhere}
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        params,
      );
      rows = result.rows;
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /lab/slots  (lab_staff only)
// ---------------------------------------------------------------------------
export const createLabSlot = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.user!;
    const staff = await resolveLabStaff(userId);
    if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }

    const { test_id, slot_date, slot_time, duration_minutes, max_bookings, organization_id } = req.body;
    // Use explicitly provided org, fall back to the staff member's own org (may be null)
    const resolvedOrgId = organization_id ?? staff.organization_id ?? null;

    const result = await query(
      `INSERT INTO lab_slots (lab_staff_id, test_id, slot_date, slot_time, duration_minutes, max_bookings, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [staff.id, test_id ?? null, slot_date, slot_time, duration_minutes ?? 15, max_bookings ?? 1, resolvedOrgId],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /lab/slots/:id  (lab_staff only – must own the slot)
// ---------------------------------------------------------------------------
export const updateLabSlot = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.user!;
    const staff = await resolveLabStaff(userId);
    if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }

    const slotId = Number(req.params.id);
    const { test_id, slot_date, slot_time, duration_minutes, max_bookings, is_active, organization_id } = req.body;

    const result = await query(
      `UPDATE lab_slots
       SET test_id          = COALESCE($1, test_id),
           slot_date        = COALESCE($2, slot_date),
           slot_time        = COALESCE($3, slot_time),
           duration_minutes = COALESCE($4, duration_minutes),
           max_bookings     = COALESCE($5, max_bookings),
           is_active        = COALESCE($6, is_active),
           organization_id  = COALESCE($7, organization_id)
       WHERE id = $8 AND lab_staff_id = $9
       RETURNING *`,
      [test_id ?? null, slot_date ?? null, slot_time ?? null,
       duration_minutes ?? null, max_bookings ?? null, is_active ?? null,
       organization_id ?? null, slotId, staff.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Slot not found or access denied' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /lab/slots/:id  (lab_staff only – must own the slot)
// ---------------------------------------------------------------------------
export const deleteLabSlot = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.user!;
    const staff = await resolveLabStaff(userId);
    if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }

    const slotId = Number(req.params.id);

    const result = await query(
      `DELETE FROM lab_slots WHERE id = $1 AND lab_staff_id = $2 RETURNING id`,
      [slotId, staff.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Slot not found or access denied' });
      return;
    }

    res.json({ success: true, message: 'Slot deleted' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /lab/appointments
// lab_staff  → appointments for their slots
// patient    → their own appointments
// admin      → all
// ---------------------------------------------------------------------------
export const getLabAppointments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, roleName } = req.user!;

    let result;
    const orgFilter = req.query.organization_id ? Number(req.query.organization_id) : null;

    if (roleName === 'lab_staff') {
      const staff = await resolveLabStaff(userId);
      if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }
      result = await query(
        `SELECT la.*, ls.slot_date, ls.slot_time,
                p.first_name AS patient_first, p.last_name AS patient_last,
                ltc.name AS test_name, o.name AS organization_name
         FROM lab_appointments la
         JOIN lab_slots ls ON ls.id = la.lab_slot_id
         JOIN patients p ON p.id = la.patient_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = la.lab_test_id
         LEFT JOIN organizations o ON o.id = la.organization_id
         WHERE ls.lab_staff_id = $1
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        [staff.id],
      );
    } else if (roleName === 'patient') {
      const patRes = await query(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [userId]);
      const patientId = patRes.rows[0]?.id;
      if (!patientId) { res.status(404).json({ success: false, message: 'Patient profile not found' }); return; }
      result = await query(
        `SELECT la.*, ls.slot_date, ls.slot_time,
                lsp.name AS staff_name, ltc.name AS test_name, o.name AS organization_name
         FROM lab_appointments la
         JOIN lab_slots ls ON ls.id = la.lab_slot_id
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = la.lab_test_id
         LEFT JOIN organizations o ON o.id = la.organization_id
         WHERE la.patient_id = $1
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        [patientId],
      );
    } else {
      // admin: all appointments, optional org filter
      const params: unknown[] = [];
      let orgWhere = '';
      if (orgFilter) { params.push(orgFilter); orgWhere = `WHERE la.organization_id = $${params.length}`; }
      result = await query(
        `SELECT la.*, ls.slot_date, ls.slot_time,
                p.first_name AS patient_first, p.last_name AS patient_last,
                lsp.name AS staff_name, ltc.name AS test_name, o.name AS organization_name
         FROM lab_appointments la
         JOIN lab_slots ls ON ls.id = la.lab_slot_id
         JOIN patients p ON p.id = la.patient_id
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = la.lab_test_id
         LEFT JOIN organizations o ON o.id = la.organization_id
         ${orgWhere}
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        params,
      );
    }

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /lab/appointments  (patient books a slot)
// ---------------------------------------------------------------------------
export const bookLabAppointment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    const { userId } = req.user!;
    const { lab_slot_id, lab_test_id, notes } = req.body;

    await client.query('BEGIN');

    const patRes = await client.query(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [userId]);
    const patientId = patRes.rows[0]?.id;
    if (!patientId) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Patient profile not found' });
      return;
    }

    // Check slot availability (lock the row)
    const slotRes = await client.query(
      `SELECT ls.id, ls.max_bookings, ls.organization_id,
              COUNT(la.id) AS current_bookings
       FROM lab_slots ls
       LEFT JOIN lab_appointments la
         ON la.lab_slot_id = ls.id AND la.status NOT IN ('cancelled')
       WHERE ls.id = $1 AND ls.is_active = true AND ls.slot_date >= CURRENT_DATE
       GROUP BY ls.id, ls.max_bookings, ls.organization_id
       FOR UPDATE OF ls`,
      [lab_slot_id],
    );

    if (slotRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Slot not found or not available' });
      return;
    }

    const { max_bookings, current_bookings } = slotRes.rows[0];
    if (Number(current_bookings) >= Number(max_bookings)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, message: 'This slot is fully booked' });
      return;
    }

    // Carry the slot's organization_id into the appointment for easy filtering
    const orgId = slotRes.rows[0].organization_id ?? null;

    const result = await client.query(
      `INSERT INTO lab_appointments (patient_id, lab_slot_id, lab_test_id, notes, organization_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [patientId, lab_slot_id, lab_test_id ?? null, notes ?? null, orgId],
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------------------------
// PATCH /lab/appointments/:id  (lab_staff updates status / notes)
// ---------------------------------------------------------------------------
export const updateLabAppointment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, roleName } = req.user!;
    const apptId = Number(req.params.id);
    const { status, notes } = req.body;

    // lab_staff may only update appointments belonging to their slots
    let ownershipClause = '';
    const params: unknown[] = [status ?? null, notes ?? null, apptId];

    if (roleName === 'lab_staff') {
      const staff = await resolveLabStaff(userId);
      if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }
      ownershipClause = `AND EXISTS (
        SELECT 1 FROM lab_slots ls WHERE ls.id = la.lab_slot_id AND ls.lab_staff_id = $4
      )`;
      params.push(staff.id);
    }

    const result = await query(
      `UPDATE lab_appointments la
       SET status = COALESCE($1, status),
           notes  = COALESCE($2, notes)
       WHERE la.id = $3 ${ownershipClause}
       RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found or access denied' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};
