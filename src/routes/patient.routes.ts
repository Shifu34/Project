import { Router } from 'express';
import { body } from 'express-validator';
import * as patientCtrl from '../controllers/patient.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/',    patientCtrl.getPatients);
router.get('/me',     patientCtrl.getPatientByUserId);
router.put('/me',     patientCtrl.updateMyProfile);
router.get('/search', patientCtrl.searchPatientsByParams);
router.get('/:id',    patientCtrl.getPatientById);
router.get('/:id/appointments',      patientCtrl.getPatientAppointments);
router.get('/:id/visits',            patientCtrl.getPatientVisits);
router.get('/:id/medical-history',   patientCtrl.getPatientMedicalHistory);
router.get('/:id/encounters',        patientCtrl.getPatientEncounters);
router.get('/:id/lab-orders',        patientCtrl.getPatientLabOrders);
router.get('/:id/radiology-orders',  patientCtrl.getPatientRadiologyOrders);
router.get('/:id/prescriptions',     patientCtrl.getPatientPrescriptions);

router.post('/',
  authorize('admin', 'doctor'),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').notEmpty(),
  body('date_of_birth').isISO8601(),
  validate,
  patientCtrl.createPatient,
);

router.put('/:id',
  authorize('admin', 'doctor'),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('phone').notEmpty(),
  validate,
  patientCtrl.updatePatient,
);

router.delete('/:id', authorize('admin'), patientCtrl.deletePatient);

export default router;
