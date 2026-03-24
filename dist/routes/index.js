"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const patient_routes_1 = __importDefault(require("./patient.routes"));
const doctor_routes_1 = __importDefault(require("./doctor.routes"));
const department_routes_1 = __importDefault(require("./department.routes"));
const appointment_routes_1 = __importDefault(require("./appointment.routes"));
const visit_routes_1 = __importDefault(require("./visit.routes"));
const prescription_routes_1 = __importDefault(require("./prescription.routes"));
const lab_routes_1 = __importDefault(require("./lab.routes"));
const ward_routes_1 = __importDefault(require("./ward.routes"));
const billing_routes_1 = __importDefault(require("./billing.routes"));
const pharmacy_routes_1 = __importDefault(require("./pharmacy.routes"));
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use('/auth', auth_routes_1.default);
router.use('/patients', patient_routes_1.default);
router.use('/doctors', doctor_routes_1.default);
router.use('/departments', department_routes_1.default);
router.use('/appointments', appointment_routes_1.default);
router.use('/encounters', visit_routes_1.default); // renamed from /visits
router.use('/visits', visit_routes_1.default); // backward-compat alias
router.use('/prescriptions', prescription_routes_1.default);
router.use('/lab', lab_routes_1.default);
router.use('/ward', ward_routes_1.default);
router.use('/billing', billing_routes_1.default);
router.use('/pharmacy', pharmacy_routes_1.default);
router.get('/dashboard', auth_middleware_1.authenticate, dashboard_controller_1.getDashboardStats);
exports.default = router;
//# sourceMappingURL=index.js.map