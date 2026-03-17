import { Router } from 'express';
import { body } from 'express-validator';
import * as authCtrl from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// Self-registration for patients
router.post('/register',
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('date_of_birth').isISO8601().withMessage('date_of_birth must be a valid date (YYYY-MM-DD)'),
  body('cnic').notEmpty().trim().withMessage('CNIC is required'),
  body('phone').notEmpty().trim(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('gender must be male, female, or other'),
  validate,
  authCtrl.registerPatient,
);

router.post('/login',
  body('identifier').notEmpty().trim().withMessage('Email or CNIC is required'),
  body('password').notEmpty(),
  validate,
  authCtrl.login,
);

router.post('/refresh-token',
  body('refreshToken').notEmpty(),
  validate,
  authCtrl.refreshToken,
);

router.get('/me', authenticate, authCtrl.getMe);

router.put('/change-password',
  authenticate,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  validate,
  authCtrl.changePassword,
);

router.post('/forgot-password',
  body('email').isEmail().withMessage('A valid email is required'),
  validate,
  authCtrl.forgotPassword,
);

router.post('/resend-reset-code',
  body('email').isEmail().withMessage('A valid email is required'),
  validate,
  authCtrl.resendResetCode,
);

router.post('/verify-reset-code',
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  validate,
  authCtrl.verifyResetCode,
);

router.post('/reset-password',
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  validate,
  authCtrl.resetPassword,
);

router.post('/send-registration-code',
  body('email').isEmail().withMessage('A valid email is required'),
  validate,
  authCtrl.sendRegistrationOtp,
);

router.post('/verify-registration-code',
  body('email').isEmail().withMessage('A valid email is required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  validate,
  authCtrl.verifyRegistrationOtp,
);

export default router;
