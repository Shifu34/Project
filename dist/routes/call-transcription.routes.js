"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const call_transcription_controller_1 = require("../controllers/call-transcription.controller");
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('transcription').notEmpty().withMessage('transcription is required'),
], validate_middleware_1.validate, call_transcription_controller_1.createCallTranscription);
router.get('/', auth_middleware_1.authenticate, call_transcription_controller_1.getCallTranscriptions);
router.get('/:id', auth_middleware_1.authenticate, call_transcription_controller_1.getCallTranscriptionById);
exports.default = router;
//# sourceMappingURL=call-transcription.routes.js.map