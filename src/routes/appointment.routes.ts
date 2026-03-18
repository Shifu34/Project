import { Router } from 'express';
import { body } from 'express-validator';
import * as apptCtrl from '../controllers/appointment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/me',              apptCtrl.getMyAppointments);
router.get('/:id',             apptCtrl.getAppointmentById);

router.post('/',
  authorize('admin', 'doctor', 'patient'),
  body('patient_id').isInt(),
  body('doctor_id').isInt(),
  body('appointment_date').isISO8601(),
  body('appointment_time').matches(/^\d{2}:\d{2}$/),
  validate,
  apptCtrl.createAppointment,
);

router.put('/:id', authorize('admin', 'doctor'), validate, apptCtrl.updateAppointment);

router.patch('/:id/status',
  authorize('admin', 'doctor', 'patient'),
  body('status').isIn(['scheduled','confirmed','in_progress','completed','cancelled','no_show']),
  validate,
  apptCtrl.updateAppointmentStatus,
);

export default router;
