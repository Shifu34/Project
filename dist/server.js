"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const database_1 = __importDefault(require("./config/database"));
const logger_1 = __importDefault(require("./config/logger"));
const appointmentPaymentTimeout_1 = require("./jobs/appointmentPaymentTimeout");
const medicationExpiry_1 = require("./jobs/medicationExpiry");
const appointmentStatus_1 = require("./jobs/appointmentStatus");
const start = async () => {
    // Verify DB connection
    try {
        const client = await database_1.default.connect();
        logger_1.default.info('PostgreSQL connected successfully');
        client.release();
    }
    catch (err) {
        logger_1.default.error('Failed to connect to PostgreSQL', err);
        process.exit(1);
    }
    // Start background jobs
    (0, appointmentPaymentTimeout_1.startPaymentTimeoutJob)();
    (0, medicationExpiry_1.startMedicationExpiryJob)();
    (0, appointmentStatus_1.startAppointmentStatusJob)();
    const server = app_1.default.listen(env_1.env.port, () => {
        logger_1.default.info(`Murshid Hospital API running on port ${env_1.env.port} [${env_1.env.nodeEnv}]`);
    });
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger_1.default.info(`${signal} received – shutting down gracefully`);
        server.close(async () => {
            await database_1.default.end();
            logger_1.default.info('Database pool closed');
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};
start();
//# sourceMappingURL=server.js.map