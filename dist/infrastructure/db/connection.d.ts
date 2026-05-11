import { Pool, QueryResult } from 'pg';
export declare const pool: Pool;
export declare function query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
export declare function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
export declare function execute(sql: string, params?: unknown[]): Promise<QueryResult>;
