import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const createCallRoom: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getCallRoom: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const generateToken: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getAppointmentVideo: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateRoomStatus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getRoomDetail: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const listRooms: (_req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=call.controller.d.ts.map