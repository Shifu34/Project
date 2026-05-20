import { Router } from 'express';
import { body } from 'express-validator';
import * as apptCtrl from '../controllers/appointment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Fixed path routes first (before /:id)
router.get('/',                 authorize('org_admin', 'branch_admin', 'doctor'), apptCtrl.getAppointments);
router.get('/categories',       apptCtrl.getAppointmentCategories);
router.get('/nature-of-visits', apptCtrl.getNatureOfVisits);
router.get('/range',            authorize('org_admin', 'branch_admin', 'doctor'), apptCtrl.getAppointmentsByDateRange);
router.get('/:id',              apptCtrl.getAppointmentById);

router.put('/:id', authorize('org_admin', 'branch_admin', 'doctor'), validate, apptCtrl.updateAppointment);

router.patch('/:id/status',
  authorize('org_admin', 'branch_admin', 'doctor', 'patient'),
  body('status').isIn(['scheduled','confirmed','in_progress','completed','cancelled','no_show']),
  validate,
  apptCtrl.updateAppointmentStatus,
);

export default router;
