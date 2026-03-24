import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    status?: number;
    code?: string;
}
export declare const errorHandler: (err: AppError, _req: Request, res: Response, _next: NextFunction) => void;
export declare const notFound: (_req: Request, res: Response) => void;
//# sourceMappingURL=error.middleware.d.ts.map