import { Router } from 'express';
import { body } from 'express-validator';
import * as labCtrl from '../controllers/lab.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/tests',                       labCtrl.getLabTests);
router.get('/orders',                      labCtrl.getLabOrders);
router.get('/orders/:id',                  labCtrl.getLabOrderById);

router.post('/orders',
  authorize('admin', 'doctor'),
  body('encounter_id').isInt(),
  body('patient_id').isInt(),
  body('doctor_id').isInt(),
  body('test_ids').isArray({ min: 1 }),
  validate,
  labCtrl.createLabOrder,
);

router.post('/order-items/:id/result',
  authorize('admin', 'doctor'),
  body('result_value').notEmpty(),
  validate,
  labCtrl.enterLabResult,
);

router.patch('/order-items/:id/verify',
  authorize('admin', 'doctor'),
  labCtrl.verifyLabResult,
);

export default router;
