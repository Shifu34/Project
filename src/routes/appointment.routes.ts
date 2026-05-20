import { Router } from 'express';
import { body } from 'express-validator';
import * as apptCtrl from '../controllers/appointment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Fixed path routes first (before /:id)
router.get('/',                 authorize('admin', 'doctor', 'super_admin'), apptCtrl.getAppointments);
router.get('/categories',       apptCtrl.getAppointmentCategories);
router.get('/nature-of-visits', apptCtrl.getNatureOfVisits);
router.get('/range',            authorize('admin', 'doctor', 'super_admin'), apptCtrl.getAppointmentsByDateRange);
router.get('/:id',              apptCtrl.getAppointmentById);

router.put('/:id', authorize('admin', 'doctor'), validate, apptCtrl.updateAppointment);

router.patch('/:id/status',
  authorize('admin', 'doctor', 'patient'),
  body('status').isIn(['scheduled','confirmed','in_progress','completed','cancelled','no_show']),
  validate,
  apptCtrl.updateAppointmentStatus,
);

export default router;
