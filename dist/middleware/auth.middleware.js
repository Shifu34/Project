"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        req.user = decoded;
        next();
    }
    catch {
        res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};
exports.authenticate = authenticate;
// Role-based access control
const authorize = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
    }
    if (!allowedRoles.includes(req.user.roleName)) {
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
    }
    next();
};
exports.authorize = authorize;
//# sourceMappingURL=auth.middleware.js.map