import { Request, Response, NextFunction } from 'express';
export declare const getLabTests: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getRadiologyTests: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createLabOrder: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getLabOrderById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const enterLabResult: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const verifyLabResult: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getLabOrders: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=lab.controller.d.ts.map