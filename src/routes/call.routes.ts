import { Router } from 'express';
import { body } from 'express-validator';
import * as callCtrl from '../controllers/call.controller';
import * as notesCtrl from '../controllers/call-notes.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Update room enabled/disabled status
router.patch('/room/:appointment_id/status', authorize('org_admin', 'branch_admin', 'doctor'), callCtrl.updateRoomStatus);


// ── AI Notes (real-time, doctor-only) ────────────────────────────────────────
// POST   /calls/notes              — save a note
// GET    /calls/notes              — list notes (doctor/admin)
// GET    /calls/notes/:id          — single note (doctor/admin)
router.post(
  '/notes',
  [
    body('appointment_id').isInt({ min: 1 }),
    body('patient_user_id').isInt({ min: 1 }),
    body('note_type').optional().isIn(['realtime', 'interim', 'final']),
  ],
  validate,
  notesCtrl.createCallNote,
);
router.get('/notes',    authorize('org_admin', 'branch_admin', 'doctor'), notesCtrl.getCallNotes);
router.get('/notes/:id', authorize('org_admin', 'branch_admin', 'doctor'), notesCtrl.getCallNoteById);

export default router;
