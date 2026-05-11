import type { Article, ArticleImage } from '../../types';
interface CreateArticleParams {
    site_id: number;
    user_id?: number | null;
    keyword: string;
    outline_count?: number;
    tone?: string;
}
export declare function createArticle(fields: CreateArticleParams): Promise<Article | null>;
export declare function findArticle(id: number): Promise<Article | null>;
interface ListOpts {
    status?: string | null;
    limit?: number;
    offset?: number;
}
export declare function listArticlesForSite(siteId: number, opts?: ListOpts): Promise<Article[]>;
export declare function listAllArticles(opts?: ListOpts): Promise<Article[]>;
export declare function claimArticleForBuild(id: number): Promise<boolean>;
type ArticleUpdateFields = Partial<Pick<Article, 'title' | 'outline' | 'content_html' | 'meta_description' | 'main_keyword' | 'tags' | 'category_id' | 'featured_media_id' | 'wp_post_id' | 'wp_post_link' | 'status' | 'publish_mode' | 'scheduled_at' | 'error_message' | 'retry_count' | 'outline_count' | 'tone'>>;
export declare function updateArticle(id: number, fields: ArticleUpdateFields): Promise<Article | null>;
export declare function countArticlesForSite(siteId: number): Promise<number>;
interface InsertImageParams {
    article_id: number;
    position?: number;
    source_url?: string | null;
    wp_media_id?: number | null;
    wp_media_url?: string | null;
    is_featured?: boolean;
}
export declare function insertImage(fields: InsertImageParams): Promise<ArticleImage | null>;
export declare function listImagesForArticle(articleId: number): Promise<ArticleImage[]>;
export declare function clearImagesForArticle(articleId: number): Promise<void>;
export declare function claimScheduledArticles(limit?: number): Promise<Article[]>;
export {};
