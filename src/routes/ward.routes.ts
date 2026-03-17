import { Router } from 'express';
import { body } from 'express-validator';
import * as wardCtrl from '../controllers/ward.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Wards
router.get('/wards',     wardCtrl.getWards);
router.get('/wards/:id', wardCtrl.getWardById);

router.post('/wards',
  authorize('admin'),
  body('name').notEmpty(),
  validate,
  wardCtrl.createWard,
);

// Rooms
router.post('/wards/:id/rooms',
  authorize('admin'),
  body('room_number').notEmpty(),
  validate,
  wardCtrl.addRoom,
);

// Beds
router.post('/rooms/:room_id/beds',
  authorize('admin'),
  body('bed_number').notEmpty(),
  validate,
  wardCtrl.addBed,
);

// Admissions
router.get('/admissions',     wardCtrl.getAdmissions);
router.get('/admissions/:id', wardCtrl.getAdmissionById);

router.post('/admissions',
  authorize('admin', 'doctor'),
  body('patient_id').isInt(),
  body('doctor_id').isInt(),
  body('bed_id').isInt(),
  body('ward_id').isInt(),
  validate,
  wardCtrl.createAdmission,
);

router.post('/admissions/:id/discharge',
  authorize('admin', 'doctor'),
  validate,
  wardCtrl.dischargePatient,
);

export default router;
