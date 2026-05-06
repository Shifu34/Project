"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgScope = exports.authorize = exports.authenticate = void 0;
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
// super_admin bypasses all role checks automatically
const authorize = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
    }
    // super_admin can access everything
    if (req.user.roleName === 'super_admin') {
        next();
        return;
    }
    if (!allowedRoles.includes(req.user.roleName)) {
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
    }
    next();
};
exports.authorize = authorize;
// Org-scoping middleware
// Attaches WHERE clause fragments that controllers can use to filter by org.
// super_admin sees everything (no filter). org admins/doctors see only their org.
const orgScope = (req, _res, next) => {
    if (req.user?.roleName === 'super_admin') {
        req.orgFilter = { sql: '', params: [], isSuperAdmin: true };
    }
    else {
        const orgId = req.user?.organizationId ?? null;
        req.orgFilter = { sql: orgId ? 'organization_id = $ORG' : '', params: orgId ? [orgId] : [], isSuperAdmin: false };
    }
    next();
};
exports.orgScope = orgScope;
//# sourceMappingURL=auth.middleware.js.map