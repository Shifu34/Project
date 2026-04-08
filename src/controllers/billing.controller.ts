import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /billing/payments
export const getPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page      = Math.max(1, parseInt(req.query.page as string || '1',  10));
    const limit     = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const patientId = req.query.patient_id as string | undefined;
    const status    = req.query.status    as string | undefined;
    const offset    = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [limit, offset];
    let idx = 3;

    if (patientId) { conditions.push(`py.patient_id = $${idx++}`); params.push(patientId); }
    if (status)    { conditions.push(`py.payment_status = $${idx++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT py.*,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS received_by_name
         FROM payments py
         JOIN patients p ON p.id = py.patient_id
         LEFT JOIN users u ON u.id = py.received_by
         ${where}
         ORDER BY py.paid_at DESC LIMIT $1 OFFSET $2`,
        params,
      ),
      query(`SELECT COUNT(*) FROM payments py ${where}`, conditions.length ? params.slice(2) : []),
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
         JOIN patients p ON p.id = py.patient_id
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

// POST /billing/payments
// Role behaviour:
//   patient  — patient_id resolved from their own profile; received_by is NULL
//   doctor   — patient_id must be passed in body; received_by set to doctor's user_id
//   admin    — patient_id must be passed in body; received_by set to admin's user_id
export const recordPayment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { appointment_id, amount, payment_method, transaction_reference, notes } = req.body;
    const caller = req.user!;

    let patientId: number;
    let receivedBy: number | null;

    if (caller.roleName === 'patient') {
      // Resolve patient from authenticated user
      const patRes = await query(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [caller.userId]);
      if (patRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Patient profile not found' });
        return;
      }
      patientId = patRes.rows[0].id;
      receivedBy = null; // self-pay; no staff received
    } else {
      // Admin or doctor — patient_id must be supplied
      const bodyPatientId = parseInt(req.body.patient_id, 10);
      if (!bodyPatientId || isNaN(bodyPatientId)) {
        res.status(400).json({ success: false, message: 'patient_id is required' });
        return;
      }
      patientId = bodyPatientId;
      receivedBy = caller.userId;
    }

    const result = await query(
      `INSERT INTO payments
         (appointment_id, patient_id, amount, payment_method, transaction_reference, received_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [appointment_id ?? null, patientId, amount, payment_method, transaction_reference ?? null, receivedBy, notes ?? null],
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
