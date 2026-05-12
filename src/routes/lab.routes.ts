import { Router } from 'express';
import { body } from 'express-validator';
import * as labCtrl from '../controllers/lab.controller';
import * as labStaffCtrl from '../controllers/lab-staff.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/tests',            labCtrl.getLabTests);
router.get('/radiology-tests',  labCtrl.getRadiologyTests);
router.get('/orders',           labCtrl.getLabOrders);
router.get('/orders/:id',       labCtrl.getLabOrderById);

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

// ---------------------------------------------------------------------------
// Lab slots
// ---------------------------------------------------------------------------
router.get('/slots',
  authorize('admin', 'lab_staff', 'patient'),
  labStaffCtrl.getLabSlots,
);

router.post('/slots',
  authorize('lab_staff'),
  body('slot_date').isISO8601().withMessage('slot_date must be YYYY-MM-DD'),
  body('slot_time').notEmpty().withMessage('slot_time is required'),
  body('duration_minutes').optional().isInt({ min: 1 }),
  body('max_bookings').optional().isInt({ min: 1 }),
  validate,
  labStaffCtrl.createLabSlot,
);

router.put('/slots/:id',
  authorize('lab_staff'),
  body('slot_date').optional().isISO8601(),
  body('duration_minutes').optional().isInt({ min: 1 }),
  body('max_bookings').optional().isInt({ min: 1 }),
  validate,
  labStaffCtrl.updateLabSlot,
);

router.delete('/slots/:id',
  authorize('lab_staff'),
  labStaffCtrl.deleteLabSlot,
);

// ---------------------------------------------------------------------------
// Lab appointments
// ---------------------------------------------------------------------------
router.get('/appointments',
  authorize('admin', 'lab_staff', 'patient'),
  labStaffCtrl.getLabAppointments,
);

router.post('/appointments',
  authorize('patient'),
  body('lab_slot_id').isInt().withMessage('lab_slot_id is required'),
  validate,
  labStaffCtrl.bookLabAppointment,
);

router.patch('/appointments/:id',
  authorize('admin', 'lab_staff'),
  body('status').optional().isIn(['pending','confirmed','completed','cancelled']),
  validate,
  labStaffCtrl.updateLabAppointment,
);

export default router;
