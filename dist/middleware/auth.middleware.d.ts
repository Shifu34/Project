import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from '../types';
export interface AuthRequest extends Request {
    user?: AuthPayload;
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const authorize: (...allowedRoles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.middleware.d.ts.map