import 'express-session';
export interface SessionUser {
    id: number;
    username: string;
    email: string;
    role: string;
}
declare module 'express-session' {
    interface SessionData {
        user?: SessionUser;
        returnTo?: string;
    }
}
declare global {
    namespace Express {
        interface Response {
            __: (key: string, opts?: Record<string, unknown>) => string;
        }
        interface Request {
            getLocale?: () => string;
        }
    }
}
export interface Site extends Record<string, unknown> {
    id: number;
    domain: string;
    site_type: string;
    ssl: boolean;
    status: string;
    title?: string | null;
    description?: string | null;
    wp_user?: string | null;
    wp_pass?: string | null;
    jwt_token?: string | null;
    jwt_expires_at?: string | null;
    default_status?: string;
    image_source?: string;
    drive_folder_id?: string | null;
    default_tone?: string;
    contact_info?: string | null;
    created_by?: number | null;
    created_at: string;
    updated_at: string;
}
export type ArticleStatus = 'PENDING' | 'QUEUED' | 'BUILDING' | 'READY' | 'PUBLISHING' | 'DONE' | 'FAILED';
export type PublishMode = 'immediate' | 'scheduled';
export interface Article extends Record<string, unknown> {
    id: number;
    site_id: number;
    user_id?: number | null;
    keyword: string;
    title?: string | null;
    outline?: string | null;
    content_html?: string | null;
    meta_description?: string | null;
    main_keyword?: string | null;
    tags?: string[] | string | null;
    category_id?: number | null;
    featured_media_id?: number | null;
    wp_post_id?: number | null;
    wp_post_link?: string | null;
    outline_count: number;
    tone: string;
    status: ArticleStatus;
    publish_mode: PublishMode;
    scheduled_at?: string | null;
    error_message?: string | null;
    retry_count: number;
    created_at: string;
    updated_at: string;
}
export interface ArticleImage extends Record<string, unknown> {
    id: number;
    article_id: number;
    position: number;
    source_url?: string | null;
    wp_media_id?: number | null;
    wp_media_url?: string | null;
    is_featured: boolean;
}
export interface User extends Record<string, unknown> {
    id: number;
    username: string;
    email: string;
    password_hash?: string;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
export interface ContentJob extends Record<string, unknown> {
    id: number;
    site_id?: number | null;
    topic: string;
    num_keywords: number;
    status: string;
    created_by?: number | null;
    created_at: string;
    updated_at: string;
}
export interface ContentKeyword extends Record<string, unknown> {
    id: number;
    job_id: number;
    keyword: string;
    tone: string;
    num_outlines: number;
    category?: string | null;
    publish_status: string;
    title?: string | null;
    outline?: string | null;
    content?: string | null;
    images_json?: string | null;
    post_link?: string | null;
    status: string;
    error_message?: string | null;
    created_at: string;
    updated_at: string;
}
export interface Log extends Record<string, unknown> {
    id: number;
    level: string;
    category: string;
    message: string;
    meta_json?: string | null;
    user_id?: number | null;
    created_at: string;
}
