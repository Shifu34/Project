import { Request, Response, NextFunction } from 'express';
export declare const getInventory: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const addInventory: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const restockInventory: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const dispenseMedication: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getLowStockAlerts: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getTransactions: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=pharmacy.controller.d.ts.map