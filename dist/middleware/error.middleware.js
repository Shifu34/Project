"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.errorHandler = void 0;
const logger_1 = __importDefault(require("../config/logger"));
const errorHandler = (err, _req, res, _next) => {
    logger_1.default.error(err.message, { stack: err.stack, code: err.code });
    // PostgreSQL unique violation
    if (err.code === '23505') {
        res.status(409).json({ success: false, message: 'Duplicate entry – record already exists' });
        return;
    }
    // PostgreSQL foreign key violation
    if (err.code === '23503') {
        res.status(400).json({ success: false, message: 'Referenced record does not exist' });
        return;
    }
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: status === 500 ? 'Internal server error' : err.message,
    });
};
exports.errorHandler = errorHandler;
const notFound = (_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
};
exports.notFound = notFound;
//# sourceMappingURL=error.middleware.js.map