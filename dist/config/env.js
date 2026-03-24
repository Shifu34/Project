"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.env = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'change_me_in_production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change_refresh_secret',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    logLevel: process.env.LOG_LEVEL || 'info',
    gmailUser: process.env.GMAIL_USER || '',
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
};
//# sourceMappingURL=env.js.map