"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPayment = exports.createBill = exports.getBillById = exports.getBills = exports.getBillingSummary = exports.createRefund = exports.recordPayment = exports.getPaymentById = exports.getPayments = exports.getMyPayments = void 0;
const database_1 = require("../config/database");
// GET /billing/my-payments  — all payments for the authenticated patient
const getMyPayments = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const status = req.query.status;
        const offset = (page - 1) * limit;
        // Resolve patient from authenticated user
        const patRes = await (0, database_1.query)(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
        if (patRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient profile not found' });
            return;
        }
        const patientId = patRes.rows[0].id;
        const conditions = [`py.patient_id = $3`];
        const params = [limit, offset, patientId];
        let idx = 4;
        if (status) {
            conditions.push(`py.payment_status = $${idx++}`);
            params.push(status);
        }
        const where = `WHERE ${conditions.join(' AND ')}`;
        const countParams = [patientId];
        const countConditions = [`py.patient_id = $1`];
        let cidx = 2;
        if (status) {
            countConditions.push(`py.payment_status = $${cidx++}`);
            countParams.push(status);
        }
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT py.*,
                a.appointment_date, a.appointment_time, a.appointment_type,
                CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
                doc.specialization
         FROM payments py
         LEFT JOIN appointments a ON a.id = py.appointment_id
         LEFT JOIN doctors doc ON doc.id = a.doctor_id
         ${where}
         ORDER BY py.paid_at DESC LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM payments py WHERE ${countConditions.join(' AND ')}`, countParams),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({
            success: true,
            data: dataRes.rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getMyPayments = getMyPayments;
// GET /billing/payments  (admin/doctor — full list with optional filters)
const getPayments = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const patientId = req.query.patient_id;
        const status = req.query.status;
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [limit, offset];
        let idx = 3;
        if (patientId) {
            conditions.push(`py.patient_id = $${idx++}`);
            params.push(patientId);
        }
        if (status) {
            conditions.push(`py.payment_status = $${idx++}`);
            params.push(status);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT py.*,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS received_by_name
         FROM payments py
         JOIN patients p ON p.id = py.patient_id
         LEFT JOIN users u ON u.id = py.received_by
         ${where}
         ORDER BY py.paid_at DESC LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM payments py ${where}`, conditions.length ? params.slice(2) : []),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        next(err);
    }
};
exports.getPayments = getPayments;
// GET /billing/payments/:id
const getPaymentById = async (req, res, next) => {
    try {
        const [payRes, refundsRes] = await Promise.all([
            (0, database_1.query)(`SELECT py.*,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS received_by_name
         FROM payments py
         JOIN patients p ON p.id = py.patient_id
         LEFT JOIN users u ON u.id = py.received_by
         WHERE py.id = $1`, [req.params.id]),
            (0, database_1.query)(`SELECT * FROM payment_refunds WHERE payment_id = $1 ORDER BY created_at DESC`, [req.params.id]),
        ]);
        if (payRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Payment not found' });
            return;
        }
        res.json({ success: true, data: { ...payRes.rows[0], refunds: refundsRes.rows } });
    }
    catch (err) {
        next(err);
    }
};
exports.getPaymentById = getPaymentById;
// POST /billing/payments  — patient only
// patient_id is resolved automatically from the authenticated user.
// Body: appointment_id, amount*, payment_method, transaction_reference,
//       payment_status, paid_at, notes
const recordPayment = async (req, res, next) => {
    try {
        const { appointment_id, amount, payment_method, transaction_reference, payment_status, paid_at, notes, } = req.body;
        // Accept explicit patient_id from body, otherwise resolve from token
        let patientId;
        if (req.body.patient_id) {
            patientId = parseInt(req.body.patient_id, 10);
        }
        else {
            const patRes = await (0, database_1.query)(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
            if (patRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Patient profile not found' });
                return;
            }
            patientId = patRes.rows[0].id;
        }
        const result = await (0, database_1.query)(`INSERT INTO payments
         (appointment_id, patient_id, amount, payment_method, transaction_reference,
          payment_status, paid_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [
            appointment_id ?? null,
            patientId,
            amount,
            payment_method ?? null,
            transaction_reference ?? null,
            payment_status ?? 'completed',
            paid_at ?? null,
            notes ?? null,
        ]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.recordPayment = recordPayment;
// POST /billing/refunds
const createRefund = async (req, res, next) => {
    try {
        const { payment_id, amount, reason } = req.body;
        const refundedBy = req.user?.userId;
        const result = await (0, database_1.query)(`INSERT INTO payment_refunds (payment_id, amount, reason, refunded_by)
       VALUES ($1,$2,$3,$4) RETURNING *`, [payment_id, amount, reason, refundedBy]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createRefund = createRefund;
// GET /billing/summary
const getBillingSummary = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT
         COUNT(*)                                                               AS total_payments,
         COALESCE(SUM(amount), 0)                                               AS total_collected,
         SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END)    AS completed_amount,
         SUM(CASE WHEN payment_status = 'pending'   THEN amount ELSE 0 END)    AS pending_amount,
         SUM(CASE WHEN payment_status = 'refunded'  THEN amount ELSE 0 END)    AS refunded_amount
       FROM payments
       WHERE paid_at >= CURRENT_DATE - INTERVAL '30 days'`);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getBillingSummary = getBillingSummary;
// Alias for backward compat routes
exports.getBills = exports.getPayments;
exports.getBillById = exports.getPaymentById;
exports.createBill = exports.recordPayment;
// POST /billing/pay  — demo payment endpoint
// Body: appointment_id, payment_method (Card | Easypaisa | Jazzcash)
const processPayment = async (req, res, next) => {
    try {
        const { appointment_id, payment_method } = req.body;
        // Resolve patient from authenticated user
        const patRes = await (0, database_1.query)(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
        if (patRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient profile not found' });
            return;
        }
        const patientId = patRes.rows[0].id;
        // Verify appointment exists and belongs to this patient
        const apptRes = await (0, database_1.query)(`SELECT id, status, patient_id FROM appointments WHERE id = $1 LIMIT 1`, [appointment_id]);
        if (apptRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        const appointment = apptRes.rows[0];
        if (appointment.patient_id !== patientId) {
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
        const methodMap = {
            Card: 'credit_card',
            Easypaisa: 'online',
            Jazzcash: 'online',
        };
        const dbMethod = methodMap[payment_method] ?? 'online';
        // Simulate demo payment processing (always succeeds)
        const mockTransactionId = `DEMO-${payment_method.toUpperCase()}-${Date.now()}`;
        // Record payment and update appointment status atomically
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const payResult = await client.query(`INSERT INTO payments
           (appointment_id, patient_id, amount, payment_method, transaction_reference,
            payment_status, notes)
         VALUES ($1, $2, 0, $3, $4, 'completed', $5) RETURNING *`, [
                appointment_id,
                patientId,
                dbMethod,
                mockTransactionId,
                `Demo payment via ${payment_method}`,
            ]);
            await client.query(`UPDATE appointments SET status = 'confirmed', updated_at = NOW() WHERE id = $1`, [appointment_id]);
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
        }
        catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        next(err);
    }
};
exports.processPayment = processPayment;
//# sourceMappingURL=billing.controller.js.map