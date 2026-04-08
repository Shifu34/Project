import { Router } from 'express';
import { body } from 'express-validator';
import * as prescCtrl from '../controllers/prescription.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/active', prescCtrl.getActivePatientMedications);
router.get('/',    prescCtrl.getPrescriptions);
router.get('/:id', prescCtrl.getPrescriptionById);

router.post('/',
  authorize('admin', 'doctor'),
  body('encounter_id').isInt(),
  body('patient_id').isInt(),
  body('doctor_id').isInt(),
  body('items').isArray({ min: 1 }),
  validate,
  prescCtrl.createPrescription,
);

export default router;
