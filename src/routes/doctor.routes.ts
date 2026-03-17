import { Router } from 'express';
import { body } from 'express-validator';
import * as doctorCtrl from '../controllers/doctor.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/search', doctorCtrl.searchDoctors);
router.get('/',    doctorCtrl.getDoctors);
router.get('/me',  doctorCtrl.getDoctorByUserId);
router.get('/:id/profile', doctorCtrl.getDoctorProfile);
router.get('/:id/schedule', doctorCtrl.getDoctorScheduleByDate);
router.get('/:id/booked-appointments', doctorCtrl.getDoctorBookedAppointments);
router.get('/:id', doctorCtrl.getDoctorById);
router.get('/:id/appointments', doctorCtrl.getDoctorAppointments);

router.post('/',
  authorize('admin'),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  validate,
  doctorCtrl.createDoctor,
);

router.put('/:id', authorize('admin', 'doctor'), validate, doctorCtrl.updateDoctor);

router.post('/:id/profile',
  authorize('admin', 'doctor'),
  validate,
  doctorCtrl.upsertDoctorProfileByDoctor,
);

router.post('/:id/schedule',
  authorize('admin', 'doctor'),
  body('date').isISO8601().withMessage('date must be a valid date (YYYY-MM-DD)'),
  body('time_slots').isArray({ min: 1 }).withMessage('time_slots must be a non-empty array'),
  validate,
  doctorCtrl.addDoctorSchedule,
);

export default router;
