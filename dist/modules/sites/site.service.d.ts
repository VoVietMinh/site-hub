import type { Site } from '../../types';
export declare function refreshFromEE(userId?: number | null): Promise<Site[]>;
export declare function listLocal(): Promise<Site[]>;
export declare function info(domain: string): Promise<{
    local: Site | null;
    eeInfo: {
        raw: string | null;
        table: Record<string, string>;
        json: unknown;
        error?: string;
    };
    recentLogs: unknown[];
}>;
interface CreateFullParams {
    domain: string;
    title?: string;
    description?: string;
    ssl?: boolean;
    adminUser?: string;
    adminPass?: string;
    adminEmail?: string;
    category?: string;
    userId?: number | null;
}
export declare function createFull(params: CreateFullParams): Promise<{
    site: Site | null;
    cfg: unknown;
    credentials: {
        url: string;
        adminUrl: string;
        user: string;
        password: string;
        email: string;
        passwordGenerated: boolean;
    };
}>;
export declare function updateCredentials(domain: string, wp_user: string, wp_pass: string): Promise<Site | null>;
export declare function remove(domain: string, userId?: number | null): Promise<boolean>;
export {};
