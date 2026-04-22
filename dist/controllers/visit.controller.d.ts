import { Request, Response, NextFunction } from 'express';
export declare const createVisit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getVisitById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateVisit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const recordVitalSigns: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const addDiagnosis: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getVisitDiagnoses: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const addClinicalNote: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getEncounterVitals: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getEncounterFull: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=visit.controller.d.ts.map