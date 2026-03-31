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

// Generate 100ms auth token
router.post(
  '/token',
  body('room_id').isString().notEmpty(),
  body('user_id').isString().notEmpty(),
  body('role').isIn(['doctor', 'patient']),
  validate,
  callCtrl.generateToken,
);

// Get existing room info by appointment id
router.get('/room/:appointment_id', callCtrl.getCallRoom);

// Update room enabled/disabled status
router.patch('/room/:appointment_id/status', authorize('admin', 'doctor'), callCtrl.updateRoomStatus);

// Get 100ms room detail
router.get('/room/:appointment_id/detail', callCtrl.getRoomDetail);

// List all 100ms rooms
router.get('/rooms', authorize('admin'), callCtrl.listRooms);

export default router;
