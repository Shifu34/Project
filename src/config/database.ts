import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isSupabase = (process.env.DB_HOST || '').includes('supabase');

const pool = new Pool(
  process.env.DATABASE_URL && isSupabase
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME     || 'murshid_hospital',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max:      20,
        idleTimeoutMillis:    30000,
        connectionTimeoutMillis: 2000,
      },
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);

export const getClient = (): Promise<PoolClient> => pool.connect();

export default pool;
