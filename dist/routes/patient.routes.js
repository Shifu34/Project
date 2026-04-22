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
const patientCtrl = __importStar(require("../controllers/patient.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', patientCtrl.getPatients);
router.get('/me', patientCtrl.getPatientByUserId);
router.put('/me', patientCtrl.updateMyProfile);
router.get('/search', patientCtrl.searchPatientsByParams);
router.get('/:id', patientCtrl.getPatientById);
router.get('/:id/appointments', patientCtrl.getPatientAppointments);
router.get('/:id/visits', patientCtrl.getPatientVisits);
router.get('/:id/medical-history', patientCtrl.getPatientMedicalHistory);
router.get('/:id/encounters', patientCtrl.getPatientEncounters);
router.get('/:id/lab-orders', patientCtrl.getPatientLabOrders);
router.get('/:id/radiology-orders', patientCtrl.getPatientRadiologyOrders);
router.get('/:id/prescriptions', patientCtrl.getPatientPrescriptions);
router.post('/', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('first_name').notEmpty().trim(), (0, express_validator_1.body)('last_name').notEmpty().trim(), (0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'), (0, express_validator_1.body)('phone').notEmpty(), (0, express_validator_1.body)('date_of_birth').isISO8601(), validate_middleware_1.validate, patientCtrl.createPatient);
router.put('/:id', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('first_name').notEmpty().trim(), (0, express_validator_1.body)('last_name').notEmpty().trim(), (0, express_validator_1.body)('phone').notEmpty(), validate_middleware_1.validate, patientCtrl.updatePatient);
router.delete('/:id', (0, auth_middleware_1.authorize)('admin'), patientCtrl.deletePatient);
exports.default = router;
//# sourceMappingURL=patient.routes.js.map