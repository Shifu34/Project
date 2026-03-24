"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const isSupabase = (process.env.DB_HOST || '').includes('supabase');
const pool = new pg_1.Pool(process.env.DATABASE_URL && isSupabase
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'murshid_hospital',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});
const query = (text, params) => pool.query(text, params);
exports.query = query;
const getClient = () => pool.connect();
exports.getClient = getClient;
exports.default = pool;
//# sourceMappingURL=database.js.map