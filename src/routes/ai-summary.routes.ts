import { Router } from 'express';
import { body, query as queryValidator } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate }     from '../middleware/validate.middleware';
import {
  createAiSummary,
  getAiSummaryById,
  getAiSummaries,
  createCallSummary,
  getCallSummary,
} from '../controllers/ai-summary.controller';

const router = Router();

const VALID_TYPES = ['call', 'encounter', 'report', 'lab_order', 'radiology_order', 'prescription', 'general'];

// ── Generic AI summary CRUD ──────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  [
    body('summary_type').isIn(VALID_TYPES).withMessage(`summary_type must be one of: ${VALID_TYPES.join(', ')}`),
    body('content').notEmpty().withMessage('content is required'),
    body('patient_id').isInt({ min: 1 }).withMessage('patient_id must be a positive integer'),
  ],
  validate,
  createAiSummary,
);

router.get('/',    authenticate, getAiSummaries);
router.get('/:id', authenticate, getAiSummaryById);

// ── Call summary (post-call, visible to doctor + patient) ────────────────────
// POST /ai-summaries/call-summary
router.post(
  '/call-summary',
  authenticate,
  [
    body('appointment_id').isInt({ min: 1 }),
    body('patient_id').isInt({ min: 1 }),
    body('content').notEmpty(),
  ],
  validate,
  createCallSummary,
);

// GET /ai-summaries/call-summary?appointment_id=
router.get('/call-summary', authenticate, getCallSummary);

export default router;
