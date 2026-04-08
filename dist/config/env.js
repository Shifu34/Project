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
    hmsManagementToken: process.env.HMS_MANAGEMENT_TOKEN || '',
    hmsTemplateId: process.env.HMS_TEMPLATE_ID || '69ca5cc06cb1ece855eaf872',
    hmsAccessKey: process.env.HMS_ACCESS_KEY || '',
    hmsAppSecret: process.env.HMS_APP_SECRET || '',
    // Payment timeout in ms. Default: 30 min (1_800_000).
    // Set PAYMENT_TIMEOUT_MS=30000 for 30-second local testing.
    paymentTimeoutMs: parseInt(process.env.PAYMENT_TIMEOUT_MS || String(30 * 60 * 1000), 10),
};
//# sourceMappingURL=env.js.map