import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { validate }     from '../middleware/validate.middleware';
import {
  createCallTranscription,
  getCallTranscriptionById,
  getCallTranscriptions,
} from '../controllers/call-transcription.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  [
    body('transcription').notEmpty().withMessage('transcription is required'),
  ],
  validate,
  createCallTranscription,
);

router.get('/',    authenticate, getCallTranscriptions);
router.get('/:id', authenticate, getCallTranscriptionById);

export default router;
