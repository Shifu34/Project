import { Router } from 'express';
import { body } from 'express-validator';
import * as billingCtrl from '../controllers/billing.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/summary',      billingCtrl.getBillingSummary);
router.get('/payments',     billingCtrl.getPayments);
router.get('/payments/:id', billingCtrl.getPaymentById);

// Backward-compat aliases
router.get('/bills',        billingCtrl.getPayments);
router.get('/bills/:id',    billingCtrl.getPaymentById);


// Demo payment endpoint
router.post('/pay',
  authorize('patient'),
  body('appointment_id').isInt({ min: 1 }),
  body('payment_method').isIn(['Card', 'Easypaisa', 'Jazzcash']),
  validate,
  billingCtrl.processPayment,
);

router.post('/refunds',
  authorize('org_admin', 'branch_admin'),
  body('payment_id').isInt(),
  body('amount').isFloat({ min: 0.01 }),
  validate,
  billingCtrl.createRefund,
);

export default router;
