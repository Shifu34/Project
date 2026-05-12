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
const labCtrl = __importStar(require("../controllers/lab.controller"));
const labStaffCtrl = __importStar(require("../controllers/lab-staff.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/tests', labCtrl.getLabTests);
router.get('/radiology-tests', labCtrl.getRadiologyTests);
router.get('/orders', labCtrl.getLabOrders);
router.get('/orders/:id', labCtrl.getLabOrderById);
router.post('/orders', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('encounter_id').isInt(), (0, express_validator_1.body)('patient_id').isInt(), (0, express_validator_1.body)('doctor_id').isInt(), (0, express_validator_1.body)('test_ids').isArray({ min: 1 }), validate_middleware_1.validate, labCtrl.createLabOrder);
router.post('/order-items/:id/result', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('result_value').notEmpty(), validate_middleware_1.validate, labCtrl.enterLabResult);
router.patch('/order-items/:id/verify', (0, auth_middleware_1.authorize)('admin', 'doctor'), labCtrl.verifyLabResult);
// ---------------------------------------------------------------------------
// Lab slots
// ---------------------------------------------------------------------------
router.get('/slots', (0, auth_middleware_1.authorize)('admin', 'lab_staff', 'patient'), labStaffCtrl.getLabSlots);
router.post('/slots', (0, auth_middleware_1.authorize)('lab_staff'), (0, express_validator_1.body)('slot_date').isISO8601().withMessage('slot_date must be YYYY-MM-DD'), (0, express_validator_1.body)('slot_time').notEmpty().withMessage('slot_time is required'), (0, express_validator_1.body)('duration_minutes').optional().isInt({ min: 1 }), (0, express_validator_1.body)('max_bookings').optional().isInt({ min: 1 }), validate_middleware_1.validate, labStaffCtrl.createLabSlot);
router.put('/slots/:id', (0, auth_middleware_1.authorize)('lab_staff'), (0, express_validator_1.body)('slot_date').optional().isISO8601(), (0, express_validator_1.body)('duration_minutes').optional().isInt({ min: 1 }), (0, express_validator_1.body)('max_bookings').optional().isInt({ min: 1 }), validate_middleware_1.validate, labStaffCtrl.updateLabSlot);
router.delete('/slots/:id', (0, auth_middleware_1.authorize)('lab_staff'), labStaffCtrl.deleteLabSlot);
// ---------------------------------------------------------------------------
// Lab appointments
// ---------------------------------------------------------------------------
router.get('/appointments', (0, auth_middleware_1.authorize)('admin', 'lab_staff', 'patient'), labStaffCtrl.getLabAppointments);
router.post('/appointments', (0, auth_middleware_1.authorize)('patient'), (0, express_validator_1.body)('lab_slot_id').isInt().withMessage('lab_slot_id is required'), validate_middleware_1.validate, labStaffCtrl.bookLabAppointment);
router.patch('/appointments/:id', (0, auth_middleware_1.authorize)('admin', 'lab_staff'), (0, express_validator_1.body)('status').optional().isIn(['pending', 'confirmed', 'completed', 'cancelled']), validate_middleware_1.validate, labStaffCtrl.updateLabAppointment);
exports.default = router;
//# sourceMappingURL=lab.routes.js.map