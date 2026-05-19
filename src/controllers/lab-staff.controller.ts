import { Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// Helper: insert test associations into lab_slot_tests
async function setSlotTests(client: Awaited<ReturnType<typeof getClient>>, slotId: number, testIds: number[]): Promise<void> {
  await client.query(`DELETE FROM lab_slot_tests WHERE lab_slot_id = $1`, [slotId]);
  for (const tid of testIds) {
    await client.query(`INSERT INTO lab_slot_tests (lab_slot_id, lab_test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [slotId, tid]);
  }
}

// Helper: attach test names array to slot rows
async function attachSlotTests(rows: any[]): Promise<any[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const res = await query(
    `SELECT lst.lab_slot_id, ltc.id AS test_id, ltc.name AS test_name
     FROM lab_slot_tests lst
     JOIN lab_test_catalog ltc ON ltc.id = lst.lab_test_id
     WHERE lst.lab_slot_id = ANY($1)`,
    [ids],
  );
  const map: Record<number, { id: number; name: string }[]> = {};
  for (const r of res.rows) {
    (map[r.lab_slot_id] ??= []).push({ id: r.test_id, name: r.test_name });
  }
  return rows.map((r) => ({ ...r, tests: map[r.id] ?? [] }));
}

// ---------------------------------------------------------------------------
// Helper: resolve lab_staff_profiles row from user_id
// ---------------------------------------------------------------------------
async function resolveLabStaff(userId: number): Promise<{ id: number; branch_id: number | null } | null> {
  const res = await query(`SELECT id, branch_id FROM lab_staff_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
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

    const branchFilter = req.query.branch_id ? Number(req.query.branch_id) : null;

    let rows;
    if (roleName === 'lab_staff') {
      const staff = await resolveLabStaff(userId);
      if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }
      const result = await query(
        `SELECT ls.*, lsp.name AS staff_name, b.name AS branch_name, b.branch_code
         FROM lab_slots ls
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN branches b ON b.id = ls.branch_id
         WHERE ls.lab_staff_id = $1
         ORDER BY ls.slot_date, ls.slot_time`,
        [staff.id],
      );
      rows = await attachSlotTests(result.rows);
    } else if (roleName === 'patient') {
      const params: unknown[] = [];
      let branchWhere = '';
      if (branchFilter) { params.push(branchFilter); branchWhere = `AND ls.branch_id = $${params.length}`; }
      const result = await query(
        `SELECT ls.*, lsp.name AS staff_name, b.name AS branch_name, b.branch_code,
                (ls.max_bookings - COUNT(la.id)) AS remaining_bookings
         FROM lab_slots ls
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN branches b ON b.id = ls.branch_id
         LEFT JOIN lab_appointments la
           ON la.lab_slot_id = ls.id AND la.status NOT IN ('cancelled')
         WHERE ls.is_active = true AND ls.slot_date >= CURRENT_DATE ${branchWhere}
         GROUP BY ls.id, lsp.name, b.name, b.branch_code
         HAVING (ls.max_bookings - COUNT(la.id)) > 0
         ORDER BY ls.slot_date, ls.slot_time`,
        params,
      );
      rows = await attachSlotTests(result.rows);
    } else {
      // admin: all slots, optional org filter
      const params: unknown[] = [];
      let branchWhere = '';
      if (branchFilter) { params.push(branchFilter); branchWhere = `WHERE ls.branch_id = $${params.length}`; }
      const result = await query(
        `SELECT ls.*, lsp.name AS staff_name, b.name AS branch_name, b.branch_code
         FROM lab_slots ls
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN branches b ON b.id = ls.branch_id
         ${branchWhere}
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        params,
      );
      rows = await attachSlotTests(result.rows);
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
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { userId } = req.user!;
    const staff = await resolveLabStaff(userId);
    if (!staff) { await client.query('ROLLBACK'); res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }

    const { test_ids, slot_date, slot_time, duration_minutes, max_bookings, branch_id } = req.body;
    const resolvedBranchId = branch_id ?? staff.branch_id ?? null;
    const ids: number[] = Array.isArray(test_ids) ? test_ids.map(Number) : [];

    const result = await client.query(
      `INSERT INTO lab_slots (lab_staff_id, slot_date, slot_time, duration_minutes, max_bookings, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [staff.id, slot_date, slot_time, duration_minutes ?? 15, max_bookings ?? 1, resolvedBranchId],
    );
    const slot = result.rows[0];

    if (ids.length > 0) await setSlotTests(client, slot.id, ids);

    await client.query('COMMIT');
    const [withTests] = await attachSlotTests([slot]);
    res.status(201).json({ success: true, data: withTests });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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
    const { test_ids, slot_date, slot_time, duration_minutes, max_bookings, is_active, branch_id } = req.body;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE lab_slots
         SET slot_date        = COALESCE($1, slot_date),
             slot_time        = COALESCE($2, slot_time),
             duration_minutes = COALESCE($3, duration_minutes),
             max_bookings     = COALESCE($4, max_bookings),
             is_active        = COALESCE($5, is_active),
           branch_id        = COALESCE($6, branch_id)
         WHERE id = $7 AND lab_staff_id = $8
         RETURNING *`,
        [slot_date ?? null, slot_time ?? null,
         duration_minutes ?? null, max_bookings ?? null, is_active ?? null,
         branch_id ?? null, slotId, staff.id],
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, message: 'Slot not found or access denied' });
        return;
      }

      if (Array.isArray(test_ids)) {
        await setSlotTests(client, slotId, test_ids.map(Number));
      }

      await client.query('COMMIT');
      const [withTests] = await attachSlotTests([result.rows[0]]);
      res.json({ success: true, data: withTests });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
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
    const branchFilter = req.query.branch_id ? Number(req.query.branch_id) : null;

    if (roleName === 'lab_staff') {
      const staff = await resolveLabStaff(userId);
      if (!staff) { res.status(404).json({ success: false, message: 'Lab staff profile not found' }); return; }
      result = await query(
        `SELECT la.*, ls.slot_date, ls.slot_time,
                p.first_name AS patient_first, p.last_name AS patient_last,
                ltc.name AS test_name, b.name AS branch_name, b.branch_code
         FROM lab_appointments la
         JOIN lab_slots ls ON ls.id = la.lab_slot_id
         JOIN patients p ON p.user_id = la.patient_user_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = la.lab_test_id
         LEFT JOIN branches b ON b.id = la.branch_id
         WHERE ls.lab_staff_id = $1
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        [staff.id],
      );
    } else if (roleName === 'patient') {
      result = await query(
        `SELECT la.*, ls.slot_date, ls.slot_time,
                lsp.name AS staff_name, ltc.name AS test_name, b.name AS branch_name, b.branch_code
         FROM lab_appointments la
         JOIN lab_slots ls ON ls.id = la.lab_slot_id
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = la.lab_test_id
         LEFT JOIN branches b ON b.id = la.branch_id
         WHERE la.patient_user_id = $1
         ORDER BY ls.slot_date DESC, ls.slot_time`,
        [userId],
      );
    } else {
      // admin: all appointments, optional org filter
      const params: unknown[] = [];
      let branchWhere = '';
      if (branchFilter) { params.push(branchFilter); branchWhere = `WHERE la.branch_id = $${params.length}`; }
      result = await query(
        `SELECT la.*, ls.slot_date, ls.slot_time,
                p.first_name AS patient_first, p.last_name AS patient_last,
                lsp.name AS staff_name, ltc.name AS test_name, b.name AS branch_name, b.branch_code
         FROM lab_appointments la
         JOIN lab_slots ls ON ls.id = la.lab_slot_id
         JOIN patients p ON p.user_id = la.patient_user_id
         JOIN lab_staff_profiles lsp ON lsp.id = ls.lab_staff_id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = la.lab_test_id
         LEFT JOIN branches b ON b.id = la.branch_id
         ${branchWhere}
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

    const patRes = await client.query(`SELECT user_id FROM patients WHERE user_id = $1 LIMIT 1`, [userId]);
    const patientUserId = patRes.rows[0]?.user_id;
    if (!patientUserId) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Patient profile not found' });
      return;
    }

    // Check slot availability (lock the row)
    const slotRes = await client.query(
      `SELECT ls.id, ls.max_bookings, ls.branch_id,
              COUNT(la.id) AS current_bookings
       FROM lab_slots ls
       LEFT JOIN lab_appointments la
         ON la.lab_slot_id = ls.id AND la.status NOT IN ('cancelled')
       WHERE ls.id = $1 AND ls.is_active = true AND ls.slot_date >= CURRENT_DATE
       GROUP BY ls.id, ls.max_bookings, ls.branch_id
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

    // Carry the slot's branch_id into the appointment for easy filtering
    const branchId = slotRes.rows[0].branch_id ?? null;

    const result = await client.query(
      `INSERT INTO lab_appointments (patient_user_id, lab_slot_id, lab_test_id, notes, branch_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [patientUserId, lab_slot_id, lab_test_id ?? null, notes ?? null, branchId],
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
