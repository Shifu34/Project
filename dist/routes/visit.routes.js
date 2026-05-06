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
const visitCtrl = __importStar(require("../controllers/visit.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/:id', visitCtrl.getVisitById);
router.get('/:id/full', visitCtrl.getEncounterFull);
router.get('/:id/smart', visitCtrl.getEncounterSmart);
router.get('/:id/diagnoses', visitCtrl.getVisitDiagnoses);
router.get('/:id/vitals', visitCtrl.getEncounterVitals);
router.post('/', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('patient_id').isInt(), (0, express_validator_1.body)('doctor_id').isInt(), validate_middleware_1.validate, visitCtrl.createVisit);
router.put('/:id', (0, auth_middleware_1.authorize)('admin', 'doctor'), validate_middleware_1.validate, visitCtrl.updateVisit);
router.post('/:id/vitals', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('patient_id').isInt(), validate_middleware_1.validate, visitCtrl.recordVitalSigns);
router.post('/:id/diagnoses', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('patient_id').isInt(), (0, express_validator_1.body)('doctor_id').isInt(), (0, express_validator_1.body)('diagnosis_text').notEmpty(), validate_middleware_1.validate, visitCtrl.addDiagnosis);
router.post('/:id/clinical-notes', (0, auth_middleware_1.authorize)('admin', 'doctor'), (0, express_validator_1.body)('content').notEmpty(), validate_middleware_1.validate, visitCtrl.addClinicalNote);
exports.default = router;
//# sourceMappingURL=visit.routes.js.map