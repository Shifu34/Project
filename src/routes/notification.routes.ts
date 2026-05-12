import { Router } from 'express';
import { body } from 'express-validator';
import * as notifCtrl from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Register / update FCM token
router.post('/fcm-token',
  body('token').notEmpty().withMessage('token is required'),
  body('platform').optional().isIn(['android', 'ios', 'web']).withMessage("platform must be 'android', 'ios', or 'web'"),
  validate,
  notifCtrl.registerFcmToken,
);

// Get active FCM tokens for the current user (admin can pass ?user_id=)
router.get('/fcm-tokens', notifCtrl.getFcmTokens);

// Deactivate a token (on logout / device change)
router.delete('/fcm-token',
  body('token').optional().isString(),
  body('device_id').optional().isString(),
  validate,
  notifCtrl.deactivateFcmToken,
);

// Get paginated notifications for the current user (?page, ?limit, ?type, ?is_read)
router.get('/', notifCtrl.getNotifications);

// Update any field(s) of a notification
router.patch('/:id',
  body('type').optional().isIn(['appointment','lab_result','prescription','billing','system','alert']),
  body('is_read').optional().isBoolean(),
  validate,
  notifCtrl.updateNotification,
);

export default router;
