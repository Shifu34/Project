import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getAppointments: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getAppointmentById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateAppointmentStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getMyAppointments: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getUpcomingAppointment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const patchAppointment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const cancelAppointment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getAppointmentCategories: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=appointment.controller.d.ts.map