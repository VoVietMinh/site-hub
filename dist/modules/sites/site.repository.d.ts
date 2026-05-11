import type { Site } from '../../types';
export declare function findByDomain(domain: string): Promise<Site | null>;
export declare function findById(id: number): Promise<Site | null>;
export declare function listAll(): Promise<Site[]>;
interface UpsertParams {
    domain: string;
    site_type?: string;
    ssl?: boolean;
    status?: string;
    title?: string | null;
    description?: string | null;
    created_by?: number | null;
    wp_user?: string | null;
    wp_pass?: string | null;
}
export declare function upsert(params: UpsertParams): Promise<Site | null>;
export declare function updateCredentials(domain: string, wp_user: string | null, wp_pass: string | null): Promise<Site | null>;
export declare function remove(domain: string): Promise<void>;
interface SiteSettingsFields {
    default_status?: string;
    image_source?: string;
    drive_folder_id?: string | null;
    default_tone?: string;
    contact_info?: string | null;
}
export declare function updateSiteSettings(id: number, fields: SiteSettingsFields): Promise<Site | null>;
export {};
