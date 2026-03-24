import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getDoctors: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorByUserId: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createDoctor: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateDoctor: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorAppointments: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const searchDoctors: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const searchAvailableDoctors: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorScheduleByDate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const upsertDoctorProfileByDoctor: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const addDoctorSchedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorAvailableSlots: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateDoctorSchedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteDoctorSchedule: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getDoctorBookedAppointments: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=doctor.controller.d.ts.map