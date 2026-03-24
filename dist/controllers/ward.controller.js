"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdmissions = exports.dischargePatient = exports.getAdmissionById = exports.createAdmission = exports.addBed = exports.addRoom = exports.createWard = exports.getWardById = exports.getWards = void 0;
// Ward management has been removed from this version of the schema.
// Inpatient tracking is handled via encounters with encounter_type = 'inpatient'.
const getWards = (_req, res, _next) => {
    res.status(410).json({ success: false, message: 'Ward management is not available in this version.' });
};
exports.getWards = getWards;
exports.getWardById = exports.getWards;
exports.createWard = exports.getWards;
exports.addRoom = exports.getWards;
exports.addBed = exports.getWards;
exports.createAdmission = exports.getWards;
exports.getAdmissionById = exports.getWards;
exports.dischargePatient = exports.getWards;
exports.getAdmissions = exports.getWards;
//# sourceMappingURL=ward.controller.js.map