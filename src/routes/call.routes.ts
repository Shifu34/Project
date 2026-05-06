import { Router } from 'express';
import { body } from 'express-validator';
import * as callCtrl from '../controllers/call.controller';
import * as notesCtrl from '../controllers/call-notes.controller';
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

// Record that a participant joined the call (called by FDA agent)
router.post(
  '/room/:appointment_id/join',
  authorize('admin', 'doctor', 'patient'),
  body('role').isIn(['doctor', 'patient']),
  validate,
  callCtrl.recordJoin,
);

// Record that the call ended (called by FDA agent or doctor)
router.post(
  '/room/:appointment_id/end',
  authorize('admin', 'doctor', 'patient'),
  callCtrl.recordEnd,
);

// ── AI Notes (real-time, doctor-only) ────────────────────────────────────────
// POST   /calls/notes              — save a note
// GET    /calls/notes              — list notes (doctor/admin)
// GET    /calls/notes/:id          — single note (doctor/admin)
router.post(
  '/notes',
  [
    body('appointment_id').isInt({ min: 1 }),
    body('patient_id').isInt({ min: 1 }),
    body('note_type').optional().isIn(['realtime', 'interim', 'final']),
  ],
  validate,
  notesCtrl.createCallNote,
);
router.get('/notes',    authorize('admin', 'doctor'), notesCtrl.getCallNotes);
router.get('/notes/:id', authorize('admin', 'doctor'), notesCtrl.getCallNoteById);

export default router;
