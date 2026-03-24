import { Pool, PoolClient } from 'pg';
declare const pool: Pool;
export declare const query: (text: string, params?: unknown[]) => Promise<import("pg").QueryResult<any>>;
export declare const getClient: () => Promise<PoolClient>;
export default pool;
//# sourceMappingURL=database.d.ts.map