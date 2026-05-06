"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const orgCtrl = __importStar(require("../controllers/organization.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Any admin can see their own org
router.get('/me', (0, auth_middleware_1.authorize)('admin', 'super_admin'), orgCtrl.getMyOrganization);
// Super admin only — manage all orgs
router.get('/', (0, auth_middleware_1.authorize)('super_admin'), orgCtrl.getOrganizations);
router.get('/:id', (0, auth_middleware_1.authorize)('super_admin'), orgCtrl.getOrganizationById);
router.get('/:id/stats', (0, auth_middleware_1.authorize)('super_admin'), orgCtrl.getOrganizationStats);
router.post('/', (0, auth_middleware_1.authorize)('super_admin'), (0, express_validator_1.body)('name').notEmpty().trim(), (0, express_validator_1.body)('admin_first_name').notEmpty().trim(), (0, express_validator_1.body)('admin_last_name').notEmpty().trim(), (0, express_validator_1.body)('admin_email').isEmail().normalizeEmail(), validate_middleware_1.validate, orgCtrl.createOrganization);
router.put('/:id', (0, auth_middleware_1.authorize)('super_admin'), validate_middleware_1.validate, orgCtrl.updateOrganization);
exports.default = router;
//# sourceMappingURL=organization.routes.js.map