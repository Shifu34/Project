import { Router } from 'express';
import * as livekitCtrl from '../controllers/livekit.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/token', authorize('patient'), livekitCtrl.generateToken);

export default router;
