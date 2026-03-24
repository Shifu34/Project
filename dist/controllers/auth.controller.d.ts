import { Request, Response, NextFunction } from 'express';
export declare const registerPatient: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const login: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const refreshToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const changePassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getMe: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const forgotPassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const resendResetCode: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const verifyResetCode: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const resetPassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const sendRegistrationOtp: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const verifyRegistrationOtp: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map