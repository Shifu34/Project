import { Router } from 'express';
import { body } from 'express-validator';
import * as notifCtrl from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

export default router;
