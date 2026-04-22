import { Router } from 'express';
import { body } from 'express-validator';
import * as visitCtrl from '../controllers/visit.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/:id',             visitCtrl.getVisitById);
router.get('/:id/full',        visitCtrl.getEncounterFull);
router.get('/:id/diagnoses',   visitCtrl.getVisitDiagnoses);
router.get('/:id/vitals',      visitCtrl.getEncounterVitals);

router.post('/',
  authorize('admin', 'doctor'),
  body('patient_id').isInt(),
  body('doctor_id').isInt(),
  validate,
  visitCtrl.createVisit,
);

router.put('/:id', authorize('admin', 'doctor'), validate, visitCtrl.updateVisit);

router.post('/:id/vitals',
  authorize('admin', 'doctor'),
  body('patient_id').isInt(),
  validate,
  visitCtrl.recordVitalSigns,
);

router.post('/:id/diagnoses',
  authorize('admin', 'doctor'),
  body('patient_id').isInt(),
  body('doctor_id').isInt(),
  body('diagnosis_text').notEmpty(),
  validate,
  visitCtrl.addDiagnosis,
);

router.post('/:id/clinical-notes',
  authorize('admin', 'doctor'),
  body('content').notEmpty(),
  validate,
  visitCtrl.addClinicalNote,
);

export default router;
