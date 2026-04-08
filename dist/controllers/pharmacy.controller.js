"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransactions = exports.getLowStockAlerts = exports.dispenseMedication = exports.restockInventory = exports.addInventory = exports.getInventory = void 0;
const database_1 = require("../config/database");
// GET /pharmacy/inventory
const getInventory = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;
        const dataParams = [limit, offset];
        const countParams = [];
        let where = '';
        if (search) {
            where = `WHERE (name ILIKE $3 OR generic_name ILIKE $3)`;
            dataParams.push(`%${search}%`);
            countParams.push(`%${search}%`);
            where = where.replace('$3', '$3'); // data query: $1=limit,$2=offset,$3=search
        }
        const countWhere = search ? `WHERE (name ILIKE $1 OR generic_name ILIKE $1)` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT * FROM inventory_items ${where} ORDER BY name ASC LIMIT $1 OFFSET $2`, dataParams),
            (0, database_1.query)(`SELECT COUNT(*) FROM inventory_items ${countWhere}`, countParams),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        next(err);
    }
};
exports.getInventory = getInventory;
// POST /pharmacy/inventory
const addInventory = async (req, res, next) => {
    try {
        const { name, generic_name, category, dosage_form, strength, unit, description, reorder_level, quantity_available, is_controlled, } = req.body;
        const orgId = req.user?.organizationId;
        const result = await (0, database_1.query)(`INSERT INTO inventory_items
         (organization_id, name, generic_name, category, dosage_form, strength, unit,
          description, reorder_level, quantity_available, is_controlled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [orgId, name, generic_name, category, dosage_form, strength, unit,
            description, reorder_level ?? 10, quantity_available ?? 0, is_controlled ?? false]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.addInventory = addInventory;
// POST /pharmacy/inventory/:id/stock-in
const restockInventory = async (req, res, next) => {
    try {
        const { quantity, unit_price, notes } = req.body;
        const performedBy = req.user?.userId;
        // Insert transaction — trigger auto-updates quantity_available
        const result = await (0, database_1.query)(`INSERT INTO inventory_transactions
         (inventory_item_id, transaction_type, quantity, unit_price, notes, performed_by)
       VALUES ($1,'stock_in',$2,$3,$4,$5)
       RETURNING *`, [req.params.id, quantity, unit_price, notes, performedBy]);
        const item = await (0, database_1.query)(`SELECT * FROM inventory_items WHERE id = $1`, [req.params.id]);
        res.json({ success: true, data: { transaction: result.rows[0], item: item.rows[0] } });
    }
    catch (err) {
        next(err);
    }
};
exports.restockInventory = restockInventory;
// POST /pharmacy/dispense  – dispense against a prescription item
const dispenseMedication = async (req, res, next) => {
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const { prescription_item_id, inventory_item_id, quantity_dispensed, notes } = req.body;
        const performedBy = req.user?.userId;
        // Row-lock and check stock
        const stockCheck = await client.query(`SELECT quantity_available FROM inventory_items WHERE id = $1 FOR UPDATE`, [inventory_item_id]);
        if (stockCheck.rows.length === 0 || stockCheck.rows[0].quantity_available < quantity_dispensed) {
            await client.query('ROLLBACK');
            res.status(409).json({ success: false, message: 'Insufficient stock' });
            return;
        }
        // Insert transaction — trigger auto-deducts quantity
        const txRes = await client.query(`INSERT INTO inventory_transactions
         (inventory_item_id, transaction_type, quantity, reference_id, reference_type, notes, performed_by)
       VALUES ($1,'dispense',$2,$3,'prescription_item',$4,$5) RETURNING *`, [inventory_item_id, quantity_dispensed, prescription_item_id, notes, performedBy]);
        // Mark prescription item dispatched
        await client.query(`UPDATE prescription_items SET is_dispensed = TRUE WHERE id = $1`, [prescription_item_id]);
        // Update prescription status
        const prescId = await client.query(`SELECT prescription_id FROM prescription_items WHERE id = $1`, [prescription_item_id]);
        if (prescId.rows.length > 0) {
            await client.query(`UPDATE prescriptions SET status =
           CASE WHEN (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = $1 AND is_dispensed = FALSE) = 0
                THEN 'dispensed' ELSE 'partially_dispensed' END
         WHERE id = $1`, [prescId.rows[0].prescription_id]);
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: txRes.rows[0] });
    }
    catch (err) {
        await client.query('ROLLBACK');
        next(err);
    }
    finally {
        client.release();
    }
};
exports.dispenseMedication = dispenseMedication;
// GET /pharmacy/low-stock
const getLowStockAlerts = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT * FROM inventory_items
       WHERE quantity_available <= reorder_level AND is_active = TRUE
       ORDER BY quantity_available ASC`);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getLowStockAlerts = getLowStockAlerts;
// GET /pharmacy/transactions
const getTransactions = async (req, res, next) => {
    try {
        const itemId = req.query.item_id;
        const where = itemId ? `WHERE it.inventory_item_id = $1` : '';
        const params = itemId ? [itemId] : [];
        const result = await (0, database_1.query)(`SELECT it.*, inv.name AS item_name
       FROM inventory_transactions it
       JOIN inventory_items inv ON inv.id = it.inventory_item_id
       ${where}
       ORDER BY it.transaction_date DESC
       LIMIT 100`, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getTransactions = getTransactions;
//# sourceMappingURL=pharmacy.controller.js.map