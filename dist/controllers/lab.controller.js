"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLabOrders = exports.verifyLabResult = exports.enterLabResult = exports.getLabOrderById = exports.createLabOrder = exports.getLabTests = void 0;
const database_1 = require("../config/database");
// GET /lab/tests  – catalog
const getLabTests = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT * FROM lab_test_catalog WHERE is_active = TRUE ORDER BY category, name`);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getLabTests = getLabTests;
// POST /lab/orders
const createLabOrder = async (req, res, next) => {
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const { encounter_id, patient_id, doctor_id, priority, clinical_notes, test_ids } = req.body;
        const orderedBy = req.user?.userId;
        const orderRes = await client.query(`INSERT INTO lab_orders (encounter_id, patient_id, doctor_id, ordered_by, priority, clinical_notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [encounter_id, patient_id, doctor_id, orderedBy, priority || 'routine', clinical_notes]);
        const order = orderRes.rows[0];
        if (Array.isArray(test_ids) && test_ids.length > 0) {
            for (const testId of test_ids) {
                await client.query(`INSERT INTO lab_order_items (lab_order_id, lab_test_id) VALUES ($1,$2)`, [order.id, testId]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: order });
    }
    catch (err) {
        await client.query('ROLLBACK');
        next(err);
    }
    finally {
        client.release();
    }
};
exports.createLabOrder = createLabOrder;
// GET /lab/orders/:id
const getLabOrderById = async (req, res, next) => {
    try {
        const [orderRes, itemsRes] = await Promise.all([
            (0, database_1.query)(`SELECT lo.*, CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM lab_orders lo
         JOIN patients p ON p.id = lo.patient_id
         JOIN doctors d ON d.id = lo.doctor_id
         JOIN users u ON u.id = d.user_id
         WHERE lo.id = $1`, [req.params.id]),
            (0, database_1.query)(`SELECT loi.*, ltc.name AS test_name, ltc.code, ltc.category, ltc.normal_range, ltc.unit
         FROM lab_order_items loi
         JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE loi.lab_order_id = $1`, [req.params.id]),
        ]);
        if (orderRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Lab order not found' });
            return;
        }
        res.json({ success: true, data: { ...orderRes.rows[0], items: itemsRes.rows } });
    }
    catch (err) {
        next(err);
    }
};
exports.getLabOrderById = getLabOrderById;
// POST /lab/order-items/:id/result  – enter results directly on the order item
const enterLabResult = async (req, res, next) => {
    try {
        const { result_value, unit, normal_range, interpretation, result_notes, } = req.body;
        const performedBy = req.user?.userId;
        const result = await (0, database_1.query)(`UPDATE lab_order_items
       SET result_value=$1, unit=$2, normal_range=$3, interpretation=$4,
           result_notes=$5, result_date=CURRENT_TIMESTAMP, performed_by=$6, status='completed'
       WHERE id = $7 RETURNING *`, [result_value, unit, normal_range, interpretation, result_notes, performedBy, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Lab order item not found' });
            return;
        }
        // Update parent order status if all items completed
        await (0, database_1.query)(`UPDATE lab_orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT lab_order_id FROM lab_order_items WHERE id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM lab_order_items
           WHERE lab_order_id = (SELECT lab_order_id FROM lab_order_items WHERE id = $1)
             AND status != 'completed'
         )`, [req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.enterLabResult = enterLabResult;
// PATCH /lab/order-items/:id/verify
const verifyLabResult = async (req, res, next) => {
    try {
        const verifiedBy = req.user?.userId;
        const result = await (0, database_1.query)(`UPDATE lab_order_items SET verified_by=$1, verified_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`, [verifiedBy, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Lab order item not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.verifyLabResult = verifyLabResult;
// GET /lab/orders  – with filters
const getLabOrders = async (req, res, next) => {
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
            conditions.push(`lo.patient_id = $${idx++}`);
            params.push(patientId);
        }
        if (status) {
            conditions.push(`lo.status = $${idx++}`);
            params.push(status);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT lo.*, CONCAT(p.first_name,' ',p.last_name) AS patient_name,
                p.patient_code, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM lab_orders lo
         JOIN patients p ON p.id = lo.patient_id
         JOIN doctors d ON d.id = lo.doctor_id
         JOIN users u ON u.id = d.user_id
         ${where}
         ORDER BY lo.order_date DESC LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM lab_orders lo ${where}`, conditions.length ? params.slice(2) : []),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        next(err);
    }
};
exports.getLabOrders = getLabOrders;
//# sourceMappingURL=lab.controller.js.map