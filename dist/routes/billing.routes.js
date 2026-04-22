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
const billingCtrl = __importStar(require("../controllers/billing.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/summary', billingCtrl.getBillingSummary);
router.get('/my-payments', (0, auth_middleware_1.authorize)('patient'), billingCtrl.getMyPayments);
router.get('/payments', billingCtrl.getPayments);
router.get('/payments/:id', billingCtrl.getPaymentById);
// Backward-compat aliases
router.get('/bills', billingCtrl.getPayments);
router.get('/bills/:id', billingCtrl.getPaymentById);
router.post('/payments', (0, auth_middleware_1.authorize)('patient'), (0, express_validator_1.body)('amount').isFloat({ min: 0.01 }), (0, express_validator_1.body)('payment_method').optional().isIn(['cash', 'credit_card', 'debit_card', 'insurance', 'bank_transfer', 'cheque', 'online']), (0, express_validator_1.body)('payment_status').optional().isIn(['completed', 'pending', 'failed', 'refunded']), (0, express_validator_1.body)('paid_at').optional().isISO8601(), validate_middleware_1.validate, billingCtrl.recordPayment);
// Demo payment endpoint
router.post('/pay', (0, auth_middleware_1.authorize)('patient'), (0, express_validator_1.body)('appointment_id').isInt({ min: 1 }), (0, express_validator_1.body)('payment_method').isIn(['Card', 'Easypaisa', 'Jazzcash']), validate_middleware_1.validate, billingCtrl.processPayment);
router.post('/refunds', (0, auth_middleware_1.authorize)('admin'), (0, express_validator_1.body)('payment_id').isInt(), (0, express_validator_1.body)('amount').isFloat({ min: 0.01 }), validate_middleware_1.validate, billingCtrl.createRefund);
exports.default = router;
//# sourceMappingURL=billing.routes.js.map