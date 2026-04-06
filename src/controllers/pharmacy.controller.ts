import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';

// GET /pharmacy/inventory
export const getInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const search = (req.query.search as string || '').trim();
    const offset = (page - 1) * limit;

    const dataParams: unknown[]  = [limit, offset];
    const countParams: unknown[] = [];
    let where = '';

    if (search) {
      where = `WHERE (name ILIKE $3 OR generic_name ILIKE $3)`;
      dataParams.push(`%${search}%`);
      countParams.push(`%${search}%`);
      where = where.replace('$3', '$3'); // data query: $1=limit,$2=offset,$3=search
    }

    const countWhere = search ? `WHERE (name ILIKE $1 OR generic_name ILIKE $1)` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT * FROM inventory_items ${where} ORDER BY name ASC LIMIT $1 OFFSET $2`,
        dataParams,
      ),
      query(`SELECT COUNT(*) FROM inventory_items ${countWhere}`, countParams),
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

    const orgId = (req as Request & { user?: { organizationId?: number } }).user?.organizationId;

    const result = await query(
      `INSERT INTO inventory_items
         (organization_id, name, generic_name, category, dosage_form, strength, unit,
          description, reorder_level, quantity_available, is_controlled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orgId, name, generic_name, category, dosage_form, strength, unit,
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
