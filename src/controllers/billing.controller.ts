import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /billing/my-payments  — all payments for the authenticated patient
export const getMyPayments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const status = req.query.status as string | undefined;
    const offset = (page - 1) * limit;

    // Resolve patient from authenticated user
    const patRes = await query(`SELECT user_id FROM patients WHERE user_id = $1 LIMIT 1`, [req.user!.userId]);
    if (patRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Patient profile not found' });
      return;
    }
    const patientUserId = patRes.rows[0].user_id;

    const conditions: string[] = [`py.patient_user_id = $3`];
    const params: unknown[] = [limit, offset, patientUserId];
    let idx = 4;

    if (status) { conditions.push(`py.payment_status = $${idx++}`); params.push(status); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countParams: unknown[] = [patientUserId];
    const countConditions: string[] = [`py.patient_user_id = $1`];
    let cidx = 2;
    if (status) { countConditions.push(`py.payment_status = $${cidx++}`); countParams.push(status); }

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT py.*,
                a.appointment_date, a.appointment_time, a.appointment_type,
                CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
                doc.specialization
         FROM payments py
         LEFT JOIN appointments a ON a.id = py.appointment_id
         LEFT JOIN doctors doc ON doc.user_id = a.doctor_user_id AND doc.branch_id = a.doctor_branch_id
         ${where}
         ORDER BY py.paid_at DESC LIMIT $1 OFFSET $2`,
        params,
      ),
      query(
        `SELECT COUNT(*) FROM payments py WHERE ${countConditions.join(' AND ')}`,
        countParams,
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /billing/payments  (admin/doctor — full list with optional filters)
export const getPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page      = Math.max(1, parseInt(req.query.page as string || '1',  10));
    const limit     = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const patientUserId = req.query.patient_user_id as string | undefined;
    const status    = req.query.status    as string | undefined;
    const offset    = (page - 1) * limit;

    const mainParams: unknown[] = [limit, offset];
    const countParams: unknown[] = [];
    const mainConditions: string[] = [];
    const countConditions: string[] = [];
    let mainIdx = 3;
    let countIdx = 1;

    if (patientUserId) {
      mainConditions.push(`py.patient_user_id = $${mainIdx++}`);
      countConditions.push(`py.patient_user_id = $${countIdx++}`);
      mainParams.push(patientUserId);
      countParams.push(patientUserId);
    }
    if (status) {
      mainConditions.push(`py.payment_status = $${mainIdx++}`);
      countConditions.push(`py.payment_status = $${countIdx++}`);
      mainParams.push(status);
      countParams.push(status);
    }

    const mainWhere  = mainConditions.length  ? `WHERE ${mainConditions.join(' AND ')}`  : '';
    const countWhere = countConditions.length ? `WHERE ${countConditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT py.*,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS received_by_name
         FROM payments py
         JOIN patients p ON p.user_id = py.patient_user_id
         LEFT JOIN users u ON u.id = py.received_by
         ${mainWhere}
         ORDER BY py.paid_at DESC LIMIT $1 OFFSET $2`,
        mainParams,
      ),
      query(`SELECT COUNT(*) FROM payments py ${countWhere}`, countParams),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// GET /billing/payments/:id
export const getPaymentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [payRes, refundsRes] = await Promise.all([
      query(
        `SELECT py.*,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS received_by_name
         FROM payments py
         JOIN patients p ON p.user_id = py.patient_user_id
         LEFT JOIN users u ON u.id = py.received_by
         WHERE py.id = $1`,
        [req.params.id],
      ),
      query(`SELECT * FROM payment_refunds WHERE payment_id = $1 ORDER BY created_at DESC`, [req.params.id]),
    ]);

    if (payRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }
    res.json({ success: true, data: { ...payRes.rows[0], refunds: refundsRes.rows } });
  } catch (err) {
    next(err);
  }
};

// POST /billing/payments  — patient only
// patient_user_id is resolved automatically from the authenticated user.
// Body: appointment_id, amount*, payment_method, transaction_reference,
//       payment_status, paid_at, notes
export const recordPayment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      appointment_id,
      amount,
      payment_method,
      transaction_reference,
      payment_status,
      paid_at,
      notes,
    } = req.body;

    // Accept explicit patient_user_id from body, otherwise resolve from token
    let patientUserId: number;
    if (req.body.patient_user_id ?? req.query.patient_user_id) {
      const raw = (req.body.patient_user_id ?? req.query.patient_user_id) as string | number;
      patientUserId = parseInt(String(raw), 10);
    } else {
      const patRes = await query(`SELECT user_id FROM patients WHERE user_id = $1 LIMIT 1`, [req.user!.userId]);
      if (patRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Patient profile not found' });
        return;
      }
      patientUserId = patRes.rows[0].user_id;
    }

    const result = await query(
      `INSERT INTO payments
         (appointment_id, patient_user_id, amount, payment_method, transaction_reference,
          payment_status, paid_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        appointment_id        ?? null,
        patientUserId,
        amount,
        payment_method        ?? null,
        transaction_reference ?? null,
        payment_status        ?? 'completed',
        paid_at               ?? null,
        notes                 ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /billing/refunds
export const createRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { payment_id, amount, reason } = req.body;
    const refundedBy = (req as Request & { user?: { userId: number } }).user?.userId;

    const result = await query(
      `INSERT INTO payment_refunds (payment_id, amount, reason, refunded_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [payment_id, amount, reason, refundedBy],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /billing/summary
export const getBillingSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)                                                               AS total_payments,
         COALESCE(SUM(amount), 0)                                               AS total_collected,
         SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END)    AS completed_amount,
         SUM(CASE WHEN payment_status = 'pending'   THEN amount ELSE 0 END)    AS pending_amount,
         SUM(CASE WHEN payment_status = 'refunded'  THEN amount ELSE 0 END)    AS refunded_amount
       FROM payments
       WHERE paid_at >= CURRENT_DATE - INTERVAL '30 days'`,
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// Alias for backward compat routes
export const getBills     = getPayments;
export const getBillById  = getPaymentById;
export const createBill   = recordPayment;

// POST /billing/pay  — demo payment endpoint
// Body: appointment_id, payment_method (Card | Easypaisa | Jazzcash)
export const processPayment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { appointment_id, payment_method } = req.body;

    // Resolve patient from authenticated user
    const patRes = await query(
      `SELECT user_id FROM patients WHERE user_id = $1 LIMIT 1`,
      [req.user!.userId],
    );
    if (patRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Patient profile not found' });
      return;
    }
    const patientUserId = patRes.rows[0].user_id;

    // Verify appointment exists and belongs to this patient
    const apptRes = await query(
      `SELECT a.id, a.status, a.patient_user_id, COALESCE(d.consultation_fee, 0) AS consultation_fee
       FROM appointments a
      JOIN doctors d ON d.user_id = a.doctor_user_id AND d.branch_id = a.doctor_branch_id
       WHERE a.id = $1 LIMIT 1`,
      [appointment_id],
    );
    if (apptRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }
    const appointment = apptRes.rows[0];
    if (appointment.patient_user_id !== patientUserId) {
      res.status(403).json({ success: false, message: 'Appointment does not belong to this patient' });
      return;
    }
    if (appointment.status === 'confirmed') {
      res.status(400).json({ success: false, message: 'Appointment is already confirmed' });
      return;
    }
    if (appointment.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Cannot pay for a cancelled appointment' });
      return;
    }

    // Map demo payment methods to DB-compatible values
    const methodMap: Record<string, string> = {
      Card:      'credit_card',
      Easypaisa: 'online',
      Jazzcash:  'online',
    };
    const dbMethod = methodMap[payment_method] ?? 'online';

    // Simulate demo payment processing (always succeeds)
    const mockTransactionId = `DEMO-${payment_method.toUpperCase()}-${Date.now()}`;

    // Record payment and update appointment status atomically
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const payResult = await client.query(
        `INSERT INTO payments
           (appointment_id, patient_user_id, amount, payment_method, transaction_reference,
            payment_status, notes)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6) RETURNING *`,
        [
          appointment_id,
          patientUserId,
          appointment.consultation_fee,
          dbMethod,
          mockTransactionId,
          `Demo payment via ${payment_method}`,
        ],
      );

      await client.query(
        `UPDATE appointments SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
        [appointment_id],
      );

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          payment: payResult.rows[0],
          appointment_id,
          appointment_status: 'confirmed',
          transaction_id: mockTransactionId,
          payment_method,
        },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};
