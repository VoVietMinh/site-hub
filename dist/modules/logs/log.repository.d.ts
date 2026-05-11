interface WriteParams {
    level?: string;
    category?: string;
    message: string;
    meta?: Record<string, unknown>;
    userId?: number | null;
}
export declare function write({ level, category, message, meta, userId, }: WriteParams): Promise<{
    id: number;
} | null>;
interface ListParams {
    limit?: number;
    offset?: number;
    category?: string | null;
    level?: string | null;
}
export declare function list({ limit, offset, category, level }?: ListParams): Promise<Record<string, unknown>[]>;
export declare function count({ category, level }?: {
    category?: string | null;
    level?: string | null;
}): Promise<number>;
export declare function distinctCategories(): Promise<string[]>;
export declare function searchByMessage(needle: string, limit?: number): Promise<Record<string, unknown>[]>;
export {};
