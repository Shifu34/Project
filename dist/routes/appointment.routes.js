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
const apptCtrl = __importStar(require("../controllers/appointment.controller"));
const visit_controller_1 = require("../controllers/visit.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Fixed path routes first (before /:id)
router.get('/', (0, auth_middleware_1.authorize)('admin', 'doctor', 'super_admin'), apptCtrl.getAppointments);
router.get('/me', apptCtrl.getMyAppointments);
router.get('/upcoming', apptCtrl.getUpcomingAppointment);
router.get('/categories', apptCtrl.getAppointmentCategories);
router.get('/nature-of-visits', apptCtrl.getNatureOfVisits);
router.get('/range', (0, auth_middleware_1.authorize)('admin', 'doctor', 'super_admin'), apptCtrl.getAppointmentsByDateRange);
router.get('/:id', apptCtrl.getAppointmentById);
// Smart field extraction — works before encounter is created
router.get('/:id/smart', visit_controller_1.getAppointmentSmart);
router.get('/:id/encounter', apptCtrl.getAppointmentEncounter);
router.post('/:id/encounter', (0, auth_middleware_1.authorize)('admin', 'doctor'), apptCtrl.saveAppointmentEncounter);
router.put('/:id/encounter', (0, auth_middleware_1.authorize)('admin', 'doctor'), apptCtrl.updateAppointmentEncounter);
router.post('/', (0, auth_middleware_1.authorize)('admin', 'doctor', 'patient'), (0, express_validator_1.body)('patient_id').isInt(), (0, express_validator_1.body)('doctor_id').isInt(), (0, express_validator_1.body)('appointment_date').isISO8601(), (0, express_validator_1.body)('appointment_time').matches(/^\d{2}:\d{2}$/), validate_middleware_1.validate, apptCtrl.createAppointment);
router.patch('/:id/cancel', (0, auth_middleware_1.authorize)('admin', 'doctor', 'patient'), apptCtrl.cancelAppointment);
router.patch('/:id', (0, auth_middleware_1.authorize)('admin', 'doctor', 'patient'), apptCtrl.patchAppointment);
router.put('/:id', (0, auth_middleware_1.authorize)('admin', 'doctor'), validate_middleware_1.validate, apptCtrl.updateAppointment);
router.patch('/:id/status', (0, auth_middleware_1.authorize)('admin', 'doctor', 'patient'), (0, express_validator_1.body)('status').isIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']), validate_middleware_1.validate, apptCtrl.updateAppointmentStatus);
exports.default = router;
//# sourceMappingURL=appointment.routes.js.map