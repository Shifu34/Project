"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBill = exports.getBillById = exports.getBills = exports.getBillingSummary = exports.createRefund = exports.recordPayment = exports.getPaymentById = exports.getPayments = void 0;
const database_1 = require("../config/database");
// GET /billing/payments
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
// POST /billing/payments
const recordPayment = async (req, res, next) => {
    try {
        const { appointment_id, patient_id, amount, payment_method, transaction_reference, notes } = req.body;
        const receivedBy = req.user?.userId;
        const result = await (0, database_1.query)(`INSERT INTO payments
         (appointment_id, patient_id, amount, payment_method, transaction_reference, received_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [appointment_id, patient_id, amount, payment_method, transaction_reference, receivedBy, notes]);
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
//# sourceMappingURL=billing.controller.js.map