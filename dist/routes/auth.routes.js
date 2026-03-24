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
const authCtrl = __importStar(require("../controllers/auth.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
// Self-registration for patients
router.post('/register', (0, express_validator_1.body)('first_name').notEmpty().trim(), (0, express_validator_1.body)('last_name').notEmpty().trim(), (0, express_validator_1.body)('date_of_birth').isISO8601().withMessage('date_of_birth must be a valid date (YYYY-MM-DD)'), (0, express_validator_1.body)('cnic').notEmpty().trim().withMessage('CNIC is required'), (0, express_validator_1.body)('phone').notEmpty().trim(), (0, express_validator_1.body)('email').isEmail(), (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'), (0, express_validator_1.body)('gender').isIn(['male', 'female', 'other']).withMessage('gender must be male, female, or other'), validate_middleware_1.validate, authCtrl.registerPatient);
router.post('/login', (0, express_validator_1.body)('identifier').notEmpty().trim().withMessage('Email or CNIC is required'), (0, express_validator_1.body)('password').notEmpty(), validate_middleware_1.validate, authCtrl.login);
router.post('/refresh-token', (0, express_validator_1.body)('refreshToken').notEmpty(), validate_middleware_1.validate, authCtrl.refreshToken);
router.get('/me', auth_middleware_1.authenticate, authCtrl.getMe);
router.put('/change-password', auth_middleware_1.authenticate, (0, express_validator_1.body)('currentPassword').notEmpty(), (0, express_validator_1.body)('newPassword').isLength({ min: 8 }), validate_middleware_1.validate, authCtrl.changePassword);
router.post('/forgot-password', (0, express_validator_1.body)('email').isEmail().withMessage('A valid email is required'), validate_middleware_1.validate, authCtrl.forgotPassword);
router.post('/resend-reset-code', (0, express_validator_1.body)('email').isEmail().withMessage('A valid email is required'), validate_middleware_1.validate, authCtrl.resendResetCode);
router.post('/verify-reset-code', (0, express_validator_1.body)('email').isEmail(), (0, express_validator_1.body)('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'), validate_middleware_1.validate, authCtrl.verifyResetCode);
router.post('/reset-password', (0, express_validator_1.body)('email').isEmail(), (0, express_validator_1.body)('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'), (0, express_validator_1.body)('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'), validate_middleware_1.validate, authCtrl.resetPassword);
router.post('/send-registration-code', (0, express_validator_1.body)('email').isEmail().withMessage('A valid email is required'), validate_middleware_1.validate, authCtrl.sendRegistrationOtp);
router.post('/verify-registration-code', (0, express_validator_1.body)('email').isEmail().withMessage('A valid email is required'), (0, express_validator_1.body)('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'), validate_middleware_1.validate, authCtrl.verifyRegistrationOtp);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map