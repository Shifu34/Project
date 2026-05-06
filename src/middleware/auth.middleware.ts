import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../types';

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Role-based access control
// super_admin bypasses all role checks automatically
export const authorize = (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    // super_admin can access everything
    if (req.user.roleName === 'super_admin') { next(); return; }
    if (!allowedRoles.includes(req.user.roleName)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };

// Org-scoping middleware
// Attaches WHERE clause fragments that controllers can use to filter by org.
// super_admin sees everything (no filter). org admins/doctors see only their org.
export const orgScope = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (req.user?.roleName === 'super_admin') {
    req.orgFilter = { sql: '', params: [], isSuperAdmin: true };
  } else {
    const orgId = req.user?.organizationId ?? null;
    req.orgFilter = { sql: orgId ? 'organization_id = $ORG' : '', params: orgId ? [orgId] : [], isSuperAdmin: false };
  }
  next();
};

// Extend Express Request with orgFilter
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgFilter?: {
        sql: string;
        params: unknown[];
        isSuperAdmin: boolean;
      };
    }
  }
}
