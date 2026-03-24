import { Router } from 'express';
import { body } from 'express-validator';
import * as deptCtrl from '../controllers/department.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/locations', deptCtrl.getDepartmentLocations);
router.get('/',    deptCtrl.getDepartments);
router.get('/:id', deptCtrl.getDepartmentById);

router.post('/',
  authorize('admin'),
  body('name').notEmpty().trim(),
  validate,
  deptCtrl.createDepartment,
);

router.put('/:id',
  authorize('admin'),
  body('name').notEmpty().trim(),
  validate,
  deptCtrl.updateDepartment,
);

export default router;
