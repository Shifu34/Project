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
const wardCtrl = __importStar(require("../controllers/ward.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Wards
router.get('/wards', wardCtrl.getWards);
router.get('/wards/:id', wardCtrl.getWardById);
router.post('/wards', (0, auth_middleware_1.authorize)('admin'), (0, express_validator_1.body)('name').notEmpty(), validate_middleware_1.validate, wardCtrl.createWard);
// Rooms
router.post('/wards/:id/rooms', (0, auth_middleware_1.authorize)('admin'), (0, express_validator_1.body)('room_number').notEmpty(), validate_middleware_1.validate, wardCtrl.addRoom);
// Beds
router.post('/rooms/:room_id/beds', (0, auth_middleware_1.authorize)('admin'), (0, express_validator_1.body)('bed_number').notEmpty(), validate_middleware_1.validate, wardCtrl.addBed);
// Admissions
router.get('/admissions', wardCtrl.getAdmissions);
router.get('/admissions/:id', wardCtrl.getAdmissionById);
router.post('/admissions', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('patient_id').isInt(), (0, express_validator_1.body)('doctor_id').isInt(), (0, express_validator_1.body)('bed_id').isInt(), (0, express_validator_1.body)('ward_id').isInt(), validate_middleware_1.validate, wardCtrl.createAdmission);
router.post('/admissions/:id/discharge', (0, auth_middleware_1.authorize)('admin', 'doctor'), validate_middleware_1.validate, wardCtrl.dischargePatient);
exports.default = router;
//# sourceMappingURL=ward.routes.js.map