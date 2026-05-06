"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const call_notes_controller_1 = require("../controllers/call-notes.controller");
const router = (0, express_1.Router)();
const NOTE_TYPES = ['realtime', 'interim', 'final'];
// POST /calls/notes — save AI-generated notes (doctor-only write + read)
router.post('/notes', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('appointment_id').isInt({ min: 1 }),
    (0, express_validator_1.body)('patient_id').isInt({ min: 1 }),
    (0, express_validator_1.body)('note_type').optional().isIn(NOTE_TYPES),
], validate_middleware_1.validate, call_notes_controller_1.createCallNote);
// GET /calls/notes — list notes (doctor/admin only)
router.get('/notes', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'doctor'), call_notes_controller_1.getCallNotes);
// GET /calls/notes/:id — single note (doctor/admin only)
router.get('/notes/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'doctor'), call_notes_controller_1.getCallNoteById);
exports.default = router;
//# sourceMappingURL=call-notes.routes.js.map