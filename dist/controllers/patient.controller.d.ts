import { Request, Response, NextFunction } from 'express';
export declare const getPatients: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPatientById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPatientByUserId: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createPatient: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateMyProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updatePatient: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const deletePatient: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPatientAppointments: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPatientVisits: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPatientMedicalHistory: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=patient.controller.d.ts.map