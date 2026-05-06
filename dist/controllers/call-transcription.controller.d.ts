import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const createCallTranscription: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallTranscriptionById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallTranscriptions: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=call-transcription.controller.d.ts.map