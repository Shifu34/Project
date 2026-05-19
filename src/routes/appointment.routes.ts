import { Router } from 'express';
import * as apptCtrl from '../controllers/appointment.controller';
import { getAppointmentSmart } from '../controllers/visit.controller';
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

// Smart field extraction — works before encounter is created
router.get('/:id/smart',        getAppointmentSmart);

router.get('/:id/encounter',
  apptCtrl.getAppointmentEncounter,
);

router.post('/:id/encounter',
  authorize('admin', 'doctor'),
  apptCtrl.saveAppointmentEncounter,
);

router.put('/:id/encounter',
  authorize('admin', 'doctor'),
  apptCtrl.updateAppointmentEncounter,
);

router.put('/:id', authorize('admin', 'doctor'), validate, apptCtrl.updateAppointment);

router.patch('/:id/status',
  authorize('admin', 'doctor', 'patient'),
  body('status').isIn(['scheduled','confirmed','in_progress','completed','cancelled','no_show']),
  validate,
  apptCtrl.updateAppointmentStatus,
);

export default router;
