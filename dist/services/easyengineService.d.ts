interface EESite {
    site?: string;
    domain?: string;
    url?: string;
    Site?: string;
    'site-url'?: string;
    site_type?: string;
    type?: string;
    ssl?: boolean | string;
    SSL?: boolean | string;
    https?: boolean | string;
    status?: string;
    Status?: string;
}
interface EEInfoResult {
    raw: string;
    table: Record<string, string>;
    json: unknown;
}
interface CreateSiteOptions {
    type?: string;
    cache?: boolean;
    ssl?: boolean;
    title?: string;
    adminUser?: string;
    adminPass?: string;
    adminEmail?: string;
}
declare function parseEeInfoTable(raw: string): Record<string, string>;
export declare function listSites(): Promise<EESite[]>;
export declare function siteInfo(domain: string): Promise<EEInfoResult>;
export declare function createSite(domain: string, options?: CreateSiteOptions): Promise<import('./commandRunner').RunResult>;
export declare function deleteSite(domain: string): Promise<import('./commandRunner').RunResult>;
export { parseEeInfoTable };
