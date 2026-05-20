import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';

// GET /pharmacy/inventory
export const getInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const search = (req.query.search as string || '').trim();
    const appointmentId = req.query.appointment_id ? Number(req.query.appointment_id) : null;
    let branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
    const offset = (page - 1) * limit;

    if (appointmentId) {
      const apptRes = await query(
        `SELECT doctor_branch_id FROM appointments WHERE id = $1`,
        [appointmentId],
      );
      if (apptRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Appointment not found' });
        return;
      }
      branchId = apptRes.rows[0].doctor_branch_id as number;
    }

    const conditions: string[] = [];
    const filterParams: unknown[] = [];

    if (search) {
      filterParams.push(`%${search}%`);
      conditions.push(`(name ILIKE $${filterParams.length} OR generic_name ILIKE $${filterParams.length})`);
    }
    if (branchId !== null) {
      filterParams.push(branchId);
      conditions.push(`branch_id = $${filterParams.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT * FROM inventory_items ${where} ORDER BY name ASC LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
        [...filterParams, limit, offset],
      ),
      query(`SELECT COUNT(*) FROM inventory_items ${where}`, filterParams),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// POST /pharmacy/inventory
export const addInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name, generic_name, category, dosage_form, strength, unit,
      description, reorder_level, quantity_available, is_controlled,
    } = req.body;

    const branchId = (req.body.branch_id ?? null) as number | null;
    if (!branchId) {
      res.status(400).json({ success: false, message: 'branch_id is required' });
      return;
    }

    const result = await query(
      `INSERT INTO inventory_items
        (branch_id, name, generic_name, category, dosage_form, strength, unit,
          description, reorder_level, quantity_available, is_controlled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [branchId, name, generic_name, category, dosage_form, strength, unit,
       description, reorder_level ?? 10, quantity_available ?? 0, is_controlled ?? false],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /pharmacy/inventory/:id/stock-in
export const restockInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { quantity, unit_price, notes } = req.body;
    const performedBy = (req as Request & { user?: { userId: number } }).user?.userId;

    // Insert transaction — trigger auto-updates quantity_available
    const result = await query(
      `INSERT INTO inventory_transactions
         (inventory_item_id, transaction_type, quantity, unit_price, notes, performed_by)
       VALUES ($1,'stock_in',$2,$3,$4,$5)
       RETURNING *`,
      [req.params.id, quantity, unit_price, notes, performedBy],
    );

    const item = await query(`SELECT * FROM inventory_items WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { transaction: result.rows[0], item: item.rows[0] } });
  } catch (err) {
    next(err);
  }
};

// POST /pharmacy/dispense  – dispense against a prescription item
export const dispenseMedication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { prescription_item_id, inventory_item_id, quantity_dispensed, notes } = req.body;
    const performedBy = (req as Request & { user?: { userId: number } }).user?.userId;

    // Row-lock and check stock
    const stockCheck = await client.query(
      `SELECT quantity_available FROM inventory_items WHERE id = $1 FOR UPDATE`,
      [inventory_item_id],
    );

    if (stockCheck.rows.length === 0 || stockCheck.rows[0].quantity_available < quantity_dispensed) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, message: 'Insufficient stock' });
      return;
    }

    // Insert transaction — trigger auto-deducts quantity
    const txRes = await client.query(
      `INSERT INTO inventory_transactions
         (inventory_item_id, transaction_type, quantity, reference_id, reference_type, notes, performed_by)
       VALUES ($1,'dispense',$2,$3,'prescription_item',$4,$5) RETURNING *`,
      [inventory_item_id, quantity_dispensed, prescription_item_id, notes, performedBy],
    );

    // Mark prescription item dispatched
    await client.query(
      `UPDATE prescription_items SET is_dispensed = TRUE WHERE id = $1`,
      [prescription_item_id],
    );

    // Update prescription status
    const prescId = await client.query(
      `SELECT prescription_id FROM prescription_items WHERE id = $1`,
      [prescription_item_id],
    );
    if (prescId.rows.length > 0) {
      await client.query(
        `UPDATE prescriptions SET status =
           CASE WHEN (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = $1 AND is_dispensed = FALSE) = 0
                THEN 'dispensed' ELSE 'partially_dispensed' END
         WHERE id = $1`,
        [prescId.rows[0].prescription_id],
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: txRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /pharmacy/low-stock
export const getLowStockAlerts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM inventory_items
       WHERE quantity_available <= reorder_level AND is_active = TRUE
       ORDER BY quantity_available ASC`,
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /pharmacy/transactions
export const getTransactions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const itemId = req.query.item_id as string | undefined;
    const where  = itemId ? `WHERE it.inventory_item_id = $1` : '';
    const params = itemId ? [itemId] : [];

    const result = await query(
      `SELECT it.*, inv.name AS item_name
       FROM inventory_transactions it
       JOIN inventory_items inv ON inv.id = it.inventory_item_id
       ${where}
       ORDER BY it.transaction_date DESC
       LIMIT 100`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// INVENTORY ORDERS  (direct patient purchases)
// ---------------------------------------------------------------------------

// POST /pharmacy/orders
export const createInventoryOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    const { patient_user_id, inventory_item_id, quantity, unit_price, notes } = req.body;
    const orderedBy = (req as Request & { user?: { userId: number } }).user?.userId;

    await client.query('BEGIN');

    // Check stock
    const stockRes = await client.query(
      `SELECT quantity_available, name, branch_id
       FROM inventory_items WHERE id = $1 AND is_active = true FOR UPDATE`,
      [inventory_item_id],
    );
    if (stockRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Inventory item not found' });
      return;
    }
    if (stockRes.rows[0].quantity_available < quantity) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, message: 'Insufficient stock' });
      return;
    }

    const totalAmount = Number(unit_price) * Number(quantity);
    const branchId = stockRes.rows[0].branch_id as number;

    const orderRes = await client.query(
      `INSERT INTO inventory_orders
         (patient_user_id, inventory_item_id, branch_id, quantity, unit_price, total_amount, notes, order_by_doctor_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patient_user_id, inventory_item_id, branchId, quantity, unit_price, totalAmount, notes ?? null, orderedBy],
    );

    // Deduct stock via inventory_transactions
    await client.query(
      `INSERT INTO inventory_transactions
         (inventory_item_id, transaction_type, quantity, unit_price, reference_id, reference_type, notes, performed_by)
       VALUES ($1,'dispense',$2,$3,$4,'inventory_order',$5,$6)`,
      [inventory_item_id, quantity, unit_price, orderRes.rows[0].id, notes ?? null, orderedBy],
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: orderRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /pharmacy/orders
// Supports ?patient_user_id, ?branch_id, ?status, ?page, ?limit
export const getInventoryOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[]  = [];

    if (req.query.patient_user_id) { params.push(req.query.patient_user_id); filters.push(`io.patient_user_id = $${params.length}`); }
    if (req.query.branch_id)       { params.push(req.query.branch_id);       filters.push(`io.branch_id = $${params.length}`); }
    if (req.query.status)          { params.push(req.query.status);           filters.push(`io.status = $${params.length}`); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM inventory_orders io ${where}`, params),
      query(
        `SELECT io.*,
                ii.name AS item_name, ii.unit,
                p.first_name AS patient_first, p.last_name AS patient_last,
            b.name AS branch_name, b.branch_code
         FROM inventory_orders io
         JOIN inventory_items ii ON ii.id = io.inventory_item_id
          JOIN patients p ON p.user_id = io.patient_user_id
          LEFT JOIN branches b ON b.id = io.branch_id
         ${where}
         ORDER BY io.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total      = Number(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages } });
  } catch (err) {
    next(err);
  }
};

// PATCH /pharmacy/orders/:id
export const updateInventoryOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, notes } = req.body;
    const result = await query(
      `UPDATE inventory_orders
       SET status     = COALESCE($1, status),
           notes      = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status ?? null, notes ?? null, req.params.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /pharmacy/revenue
// Revenue analytics for inventory orders (completed only), grouped by item or by date
// Supports ?branch_id, ?from, ?to, ?group_by=item|date|branch
export const getInventoryRevenue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters: string[] = [`io.status = 'completed'`];
    const params: unknown[]  = [];

    if (req.query.branch_id)       { params.push(req.query.branch_id);       filters.push(`io.branch_id = $${params.length}`); }
    if (req.query.from)            { params.push(req.query.from);            filters.push(`io.created_at >= $${params.length}`); }
    if (req.query.to)              { params.push(req.query.to);              filters.push(`io.created_at <= $${params.length}`); }

    const where    = `WHERE ${filters.join(' AND ')}`;
    const groupBy  = (req.query.group_by as string) || 'item';

    let selectClause: string;
    let groupClause: string;

    if (groupBy === 'date') {
      selectClause = `DATE(io.created_at) AS period, SUM(io.total_amount) AS revenue, SUM(io.quantity) AS units_sold`;
      groupClause  = `GROUP BY DATE(io.created_at) ORDER BY period DESC`;
    } else if (groupBy === 'branch') {
      selectClause = `b.id AS branch_id, b.name AS branch_name, b.branch_code, SUM(io.total_amount) AS revenue, SUM(io.quantity) AS units_sold, COUNT(*) AS order_count`;
      groupClause  = `GROUP BY b.id, b.name, b.branch_code ORDER BY revenue DESC`;
    } else {
      // default: by item
      selectClause = `ii.id AS item_id, ii.name AS item_name, ii.unit, SUM(io.quantity) AS units_sold, SUM(io.total_amount) AS revenue, COUNT(*) AS order_count`;
      groupClause  = `GROUP BY ii.id, ii.name, ii.unit ORDER BY revenue DESC`;
    }

    const [summaryRes, detailRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(io.total_amount),0) AS total_revenue,
                COALESCE(SUM(io.quantity),0)      AS total_units_sold,
                COUNT(*)                           AS total_orders
         FROM inventory_orders io ${where}`,
        params,
      ),
      query(
        `SELECT ${selectClause}
         FROM inventory_orders io
         JOIN inventory_items ii ON ii.id = io.inventory_item_id
         LEFT JOIN branches b ON b.id = io.branch_id
         ${where} ${groupClause}`,
        params,
      ),
    ]);

    res.json({
      success: true,
      data: {
        summary: summaryRes.rows[0],
        breakdown: detailRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};
