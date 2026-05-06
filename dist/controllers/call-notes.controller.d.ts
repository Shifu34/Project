import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const createCallNote: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallNoteById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallNotes: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=call-notes.controller.d.ts.map