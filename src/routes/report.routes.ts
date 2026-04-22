import { Router } from 'express';
import * as reportCtrl from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/',    reportCtrl.getReports);
router.get('/:id', reportCtrl.getReportById);

export default router;
