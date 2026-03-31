import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const createCallRoom: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallRoom: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=call.controller.d.ts.map