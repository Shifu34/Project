"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const ai_summary_controller_1 = require("../controllers/ai-summary.controller");
const router = (0, express_1.Router)();
const VALID_TYPES = ['call', 'encounter', 'report', 'lab_order', 'radiology_order', 'prescription', 'general'];
// ── Call summary — MUST be before /:id to avoid route conflict ───────────────
// POST /ai-summaries/call-summary
router.post('/call-summary', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('appointment_id').isInt({ min: 1 }),
    (0, express_validator_1.body)('patient_id').isInt({ min: 1 }),
    (0, express_validator_1.body)('content').notEmpty(),
], validate_middleware_1.validate, ai_summary_controller_1.createCallSummary);
// GET /ai-summaries/call-summary?appointment_id=
router.get('/call-summary', auth_middleware_1.authenticate, ai_summary_controller_1.getCallSummary);
// ── Generic AI summary CRUD ──────────────────────────────────────────────────
router.post('/', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('summary_type').isIn(VALID_TYPES).withMessage(`summary_type must be one of: ${VALID_TYPES.join(', ')}`),
    (0, express_validator_1.body)('content').notEmpty().withMessage('content is required'),
    (0, express_validator_1.body)('patient_id').isInt({ min: 1 }).withMessage('patient_id must be a positive integer'),
], validate_middleware_1.validate, ai_summary_controller_1.createAiSummary);
router.get('/', auth_middleware_1.authenticate, ai_summary_controller_1.getAiSummaries);
router.get('/:id', auth_middleware_1.authenticate, ai_summary_controller_1.getAiSummaryById);
exports.default = router;
//# sourceMappingURL=ai-summary.routes.js.map