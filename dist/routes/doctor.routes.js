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
const doctorCtrl = __importStar(require("../controllers/doctor.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/search', doctorCtrl.searchDoctors);
router.get('/search-available', doctorCtrl.searchAvailableDoctors);
router.get('/specializations', doctorCtrl.getAllSpecializations);
router.get('/', doctorCtrl.getDoctors);
router.get('/me', doctorCtrl.getDoctorByUserId);
router.get('/:id/profile', doctorCtrl.getDoctorProfile);
router.get('/:id/schedule', doctorCtrl.getDoctorScheduleByDate);
router.get('/:id/available-slots', doctorCtrl.getDoctorAvailableSlots);
router.get('/:id/booked-appointments', doctorCtrl.getDoctorBookedAppointments);
router.get('/:id/specialization', doctorCtrl.getDoctorSpecialization);
router.get('/:id', doctorCtrl.getDoctorById);
router.get('/:id/appointments', doctorCtrl.getDoctorAppointments);
router.post('/', (0, auth_middleware_1.authorize)('admin'), (0, express_validator_1.body)('first_name').notEmpty().trim(), (0, express_validator_1.body)('last_name').notEmpty().trim(), (0, express_validator_1.body)('email').isEmail().normalizeEmail(), validate_middleware_1.validate, doctorCtrl.createDoctor);
router.put('/:id', (0, auth_middleware_1.authorize)('admin', 'doctor'), validate_middleware_1.validate, doctorCtrl.updateDoctor);
router.post('/:id/profile', (0, auth_middleware_1.authorize)('admin', 'doctor'), validate_middleware_1.validate, doctorCtrl.upsertDoctorProfileByDoctor);
router.post('/:id/schedule', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('schedules').isArray({ min: 1 }).withMessage('schedules must be a non-empty array'), validate_middleware_1.validate, doctorCtrl.addDoctorSchedule);
router.delete('/schedule/:scheduleId', (0, auth_middleware_1.authorize)('admin', 'doctor'), doctorCtrl.deleteDoctorSchedule);
router.patch('/schedule/:scheduleId', (0, auth_middleware_1.authorize)('admin', 'doctor'), doctorCtrl.updateDoctorSchedule);
exports.default = router;
//# sourceMappingURL=doctor.routes.js.map