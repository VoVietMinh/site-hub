import type { Article } from '../../types';
export declare function generateKeywords(siteId: number, topic: string, count: number, userId?: number | null): Promise<{
    created: number;
    articles: Array<Article | null>;
}>;
export declare function buildArticle(articleId: number, publishMode?: string, scheduledAt?: string | null): Promise<{
    ok: boolean;
    message: string;
}>;
export declare function stitchHtml(paragraphs: string[], imageUrls: Array<string | null>): string;
export declare function publishArticle(articleId: number): Promise<void>;
export declare function retryArticle(articleId: number): Promise<{
    ok: boolean;
}>;
