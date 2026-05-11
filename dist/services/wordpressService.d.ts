import type { RunResult } from './commandRunner';
export declare function wp(domain: string, wpArgv: string[], opts?: {
    timeoutMs?: number;
}): Promise<RunResult>;
export declare function wpSoft(domain: string, wpArgv: string[], opts?: {
    timeoutMs?: number;
}): Promise<RunResult>;
export declare function setSiteOptions(domain: string, opts: {
    title?: string;
    description?: string;
}): Promise<void>;
export declare function applyOptionMap(domain: string, options: Record<string, string | null | undefined>): Promise<void>;
export declare function installTheme(domain: string, slug: string, opts?: {
    activate?: boolean;
}): Promise<{
    installed: RunResult;
    activated: boolean;
}>;
export declare function installPlugins(domain: string, slugs: string[], opts?: {
    activate?: boolean;
}): Promise<Array<{
    slug: string;
    ok: boolean;
    error?: string;
}>>;
export declare function ensureCategory(domain: string, name: string): Promise<string>;
export declare function findPageBySlug(domain: string, slug: string): Promise<number | null>;
export declare function createOrUpdatePage(domain: string, page: {
    slug: string;
    title: string;
    content: string;
}): Promise<number>;
export declare function deleteMenuByName(domain: string, name: string): Promise<boolean>;
export declare function createMenu(domain: string, name: string): Promise<number>;
export declare function addItemToMenu(domain: string, menuName: string, postId: number, menuTitle?: string): Promise<RunResult>;
export declare function getFirstMenuLocation(domain: string): Promise<string | null>;
export declare function assignMenuToLocation(domain: string, menuName: string, location: string | null): Promise<RunResult | null>;
export declare function flushRewrite(domain: string): Promise<RunResult>;
export declare function flushCache(domain: string): Promise<RunResult>;
interface ConfigureNewSiteResult {
    theme: string;
    plugins: Array<{
        slug: string;
        ok: boolean;
        error?: string;
    }>;
    pages: Array<{
        id: number;
        slug: string;
        menuTitle: string;
    }>;
    menuName: string;
    menuId: number | null;
    menuLocation: string | null;
    warnings: string[];
}
export declare function configureNewSite(domain: string, opts?: {
    title?: string;
    description?: string;
    category?: string;
}): Promise<ConfigureNewSiteResult>;
export {};
