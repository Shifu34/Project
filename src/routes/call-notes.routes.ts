import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createCallNote,
  getCallNoteById,
  getCallNotes,
} from '../controllers/call-notes.controller';

const router = Router();

const NOTE_TYPES = ['realtime', 'interim', 'final'];

// POST /calls/notes — save AI-generated notes (doctor-only write + read)
router.post(
  '/notes',
  authenticate,
  [
    body('appointment_id').isInt({ min: 1 }),
    body('patient_id').isInt({ min: 1 }),
    body('note_type').optional().isIn(NOTE_TYPES),
  ],
  validate,
  createCallNote,
);

// GET /calls/notes — list notes (doctor/admin only)
router.get(
  '/notes',
  authenticate,
  authorize('admin', 'doctor'),
  getCallNotes,
);

// GET /calls/notes/:id — single note (doctor/admin only)
router.get(
  '/notes/:id',
  authenticate,
  authorize('admin', 'doctor'),
  getCallNoteById,
);

export default router;
