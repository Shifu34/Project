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

export default router;
