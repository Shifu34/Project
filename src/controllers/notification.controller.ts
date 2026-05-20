import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

const getNotificationIdFromRequest = (req: Request): number | null => {
  const raw = (req.query.notification_id ?? req.body.notification_id ?? req.params.id) as string | number | undefined;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// ---------------------------------------------------------------------------
// POST /notifications/fcm-token
// Registers or updates an FCM token for the authenticated user.
// If a token for the same (user_id + device_id) already exists it is updated
// (upsert), so the client can safely call this on every app launch.
// ---------------------------------------------------------------------------
export const registerFcmToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { token, device_id, platform } = req.body;

    if (!token) {
      res.status(400).json({ success: false, message: 'token is required' });
      return;
    }

    if (platform && !['android', 'ios', 'web'].includes(platform)) {
      res.status(400).json({ success: false, message: "platform must be 'android', 'ios', or 'web'" });
      return;
    }

    // If device_id is provided → upsert on (user_id, device_id)
    // If not → upsert on the token itself (one row per unique token)
    let result;
    if (device_id) {
      result = await query(
        `INSERT INTO fcm_tokens (user_id, token, device_id, platform, is_active, updated_at)
         VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, device_id)
         DO UPDATE SET
           token      = EXCLUDED.token,
           platform   = COALESCE(EXCLUDED.platform, fcm_tokens.platform),
           is_active  = true,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, token, device_id, platform ?? null],
      );
    } else {
      // No device_id — just insert; if exact same token already exists for this user, update it
      result = await query(
        `INSERT INTO fcm_tokens (user_id, token, platform, is_active, updated_at)
         VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, device_id)
         DO UPDATE SET
           token      = EXCLUDED.token,
           platform   = COALESCE(EXCLUDED.platform, fcm_tokens.platform),
           is_active  = true,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, token, platform ?? null],
      );
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /notifications/fcm-tokens
// Returns all active FCM tokens for the authenticated user.
// Admins can pass ?user_id= to fetch tokens for any user.
// ---------------------------------------------------------------------------
export const getFcmTokens = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, roleName } = req.user!;

    let targetUserId = userId;
    if ((roleName === 'admin' || roleName === 'super_admin') && req.query.user_id) {
      targetUserId = Number(req.query.user_id);
    }

    const result = await query(
      `SELECT id, user_id, token, device_id, platform, is_active, created_at, updated_at
       FROM fcm_tokens
       WHERE user_id = $1 AND is_active = true
       ORDER BY updated_at DESC`,
      [targetUserId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /notifications/fcm-token
// Deactivates (soft-delete) a specific token.
// Body: { token } OR { device_id }
// ---------------------------------------------------------------------------
export const deactivateFcmToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { token, device_id } = req.body;

    if (!token && !device_id) {
      res.status(400).json({ success: false, message: 'Provide token or device_id to deactivate' });
      return;
    }

    const result = await query(
      `UPDATE fcm_tokens
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
         AND ($2::text IS NULL OR token     = $2)
         AND ($3::text IS NULL OR device_id = $3)
       RETURNING id`,
      [userId, token ?? null, device_id ?? null],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Token not found' });
      return;
    }

    res.json({ success: true, message: 'Token deactivated' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /notifications
// Returns paginated notifications for the authenticated user.
// Query params: page, limit, type, is_read
// Admins can pass ?user_id= to fetch for any user.
// ---------------------------------------------------------------------------
export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, roleName } = req.user!;

    let targetUserId = userId;
    if ((roleName === 'admin' || roleName === 'super_admin') && req.query.user_id) {
      targetUserId = Number(req.query.user_id);
    }

    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const filters: string[] = ['user_id = $1'];
    const params: unknown[]  = [targetUserId];

    if (req.query.type) {
      params.push(req.query.type);
      filters.push(`type = $${params.length}`);
    }
    if (req.query.is_read !== undefined) {
      params.push(req.query.is_read === 'true');
      filters.push(`is_read = $${params.length}`);
    }

    const where = `WHERE ${filters.join(' AND ')}`;

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM notifications ${where}`, params),
      query(
        `SELECT id, user_id, title, message, type, is_read, read_at, created_at
         FROM notifications
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total      = Number(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { total, page, limit, totalPages },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PATCH /notifications/:id
// Update any or all fields: title, message, type, is_read, read_at.
// Users can only update their own notifications; admins can update any.
// Automatically sets read_at when is_read is flipped to true.
// ---------------------------------------------------------------------------
export const updateNotification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, roleName } = req.user!;
    const notifId = getNotificationIdFromRequest(req);
    if (!notifId) {
      res.status(400).json({ success: false, message: 'notification_id is required' });
      return;
    }
    const { title, message, type, is_read, read_at } = req.body;

    // Auto-set read_at when marking as read; clear it when marking unread
    let resolvedReadAt = read_at ?? null;
    if (is_read === true && !resolvedReadAt) resolvedReadAt = new Date().toISOString();
    if (is_read === false) resolvedReadAt = null;

    const isAdmin = roleName === 'admin' || roleName === 'super_admin';
    const ownerClause = isAdmin ? '' : 'AND user_id = $7';
    const params: unknown[] = [
      title   ?? null,
      message ?? null,
      type    ?? null,
      is_read ?? null,
      resolvedReadAt,
      notifId,
    ];
    if (!isAdmin) params.push(userId);

    const result = await query(
      `UPDATE notifications
       SET title   = COALESCE($1, title),
           message = COALESCE($2, message),
           type    = COALESCE($3, type),
           is_read = COALESCE($4, is_read),
           read_at = $5
       WHERE id = $6 ${ownerClause}
       RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Notification not found or access denied' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};
