import { Router } from 'express';
import { body } from 'express-validator';
import * as orgCtrl from '../controllers/organization.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Any admin can see their own org
router.get('/me', authorize('admin', 'super_admin'), orgCtrl.getMyOrganization);

// Super admin only — manage all orgs
router.get('/',    authorize('super_admin'), orgCtrl.getOrganizations);
router.get('/:id', authorize('super_admin'), orgCtrl.getOrganizationById);
router.get('/:id/stats', authorize('super_admin'), orgCtrl.getOrganizationStats);

router.post('/',
  authorize('super_admin'),
  body('name').notEmpty().trim(),
  body('admin_first_name').notEmpty().trim(),
  body('admin_last_name').notEmpty().trim(),
  body('admin_email').isEmail().normalizeEmail(),
  validate,
  orgCtrl.createOrganization,
);

router.put('/:id',
  authorize('super_admin'),
  validate,
  orgCtrl.updateOrganization,
);

export default router;
