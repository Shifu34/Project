import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getPayments: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPaymentById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const recordPayment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createRefund: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getBillingSummary: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getBills: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getBillById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createBill: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=billing.controller.d.ts.map