import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const createAiSummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createCallSummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallSummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getAiSummaryById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getAiSummaries: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=ai-summary.controller.d.ts.map