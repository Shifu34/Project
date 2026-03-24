"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = require("winston");
const env_1 = require("./env");
const logger = (0, winston_1.createLogger)({
    level: env_1.env.logLevel,
    format: winston_1.format.combine(winston_1.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.format.errors({ stack: true }), winston_1.format.splat(), winston_1.format.json()),
    defaultMeta: { service: 'murshid-hospital-api' },
    transports: [
        new winston_1.transports.Console({
            format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.simple()),
        }),
    ],
});
exports.default = logger;
//# sourceMappingURL=logger.js.map