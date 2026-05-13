import { Router } from 'express';
import { body } from 'express-validator';
import * as pharmCtrl from '../controllers/pharmacy.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/inventory',           pharmCtrl.getInventory);
router.get('/inventory/low-stock', pharmCtrl.getLowStockAlerts);
router.get('/transactions',        pharmCtrl.getTransactions);

router.post('/inventory',
  authorize('admin'),
  body('name').notEmpty(),
  validate,
  pharmCtrl.addInventory,
);

router.post('/inventory/:id/stock-in',
  authorize('admin'),
  body('quantity').isInt({ min: 1 }),
  validate,
  pharmCtrl.restockInventory,
);

router.post('/dispense',
  authorize('admin', 'doctor'),
  body('prescription_item_id').isInt(),
  body('inventory_item_id').isInt(),
  body('quantity_dispensed').isInt({ min: 1 }),
  validate,
  pharmCtrl.dispenseMedication,
);

// ---------------------------------------------------------------------------
// Inventory orders (patient purchases)
// ---------------------------------------------------------------------------
router.get('/orders',  pharmCtrl.getInventoryOrders);
router.get('/revenue', pharmCtrl.getInventoryRevenue);

router.post('/orders',
  authorize('admin', 'doctor'),
  body('patient_id').isInt().withMessage('patient_id is required'),
  body('inventory_item_id').isInt().withMessage('inventory_item_id is required'),
  body('quantity').isInt({ min: 1 }).withMessage('quantity must be a positive integer'),
  body('unit_price').isFloat({ min: 0 }).withMessage('unit_price is required'),
  validate,
  pharmCtrl.createInventoryOrder,
);

router.patch('/orders/:id',
  authorize('admin'),
  body('status').optional().isIn(['pending','completed','cancelled']),
  validate,
  pharmCtrl.updateInventoryOrder,
);

export default router;
