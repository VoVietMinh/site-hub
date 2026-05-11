import type { ContentJob, ContentKeyword } from '../../types';
export declare function startJob(params: {
    topic: string;
    numKeywords: number;
    siteDomain?: string | null;
    userId: number;
}): Promise<ContentJob | null>;
export declare function configureKeyword(id: number, opts: {
    tone?: string;
    numOutlines?: string | number;
    category?: string;
    publishStatus?: string;
    title?: string;
    content?: string;
}): Promise<ContentKeyword | null>;
export declare function runKeyword(keywordId: number, _opts?: Record<string, unknown>): Promise<ContentKeyword | null>;
export declare function publishKeyword(keywordId: number): Promise<ContentKeyword | null>;
export declare function runJob(jobId: number, opts: Record<string, unknown>): Promise<ContentJob | null>;
export declare function dispatchJobToN8n(jobId: number): Promise<unknown>;
export declare function getJobStatus(jobId: number): Promise<{
    job: ContentJob;
    keywords: ContentKeyword[];
} | null>;
export declare function getJobCategories(jobId: number): Promise<{
    categories: unknown[];
    error: string | null;
}>;
export declare function checkJobConnection(jobId: number): Promise<{
    ok: boolean;
    domain: string;
    ssl: boolean;
    wpUser: string | null;
    hasCreds: boolean;
    siteInfo: unknown | null;
    categories: unknown[];
    error: string | null;
}>;
