import { Router } from 'express';
import { body } from 'express-validator';
import * as callCtrl from '../controllers/call.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Create a 100ms room for an appointment
router.post(
  '/room',
  authorize('admin', 'doctor', 'patient'),
  body('appointment_id').isInt(),
  validate,
  callCtrl.createCallRoom,
);

// Get existing room info by appointment id
router.get('/room/:appointment_id', callCtrl.getCallRoom);

export default router;
