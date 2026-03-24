"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const logger_1 = __importDefault(require("./config/logger"));
const app = (0, express_1.default)();
// Security headers
app.use((0, helmet_1.default)());
// CORS
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || env_1.env.allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
// Request logging
app.use((0, morgan_1.default)('combined', {
    stream: { write: (message) => logger_1.default.info(message.trim()) },
}));
// Body parsers
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API routes
app.use('/api/v1', routes_1.default);
// 404 handler (must come after routes)
app.use(error_middleware_1.notFound);
// Global error handler (must be last)
app.use(error_middleware_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map