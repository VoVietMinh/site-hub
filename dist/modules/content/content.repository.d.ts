import type { ContentJob, ContentKeyword } from '../../types';
export declare function createJob(params: {
    site_id: number | null;
    topic: string;
    num_keywords: number;
    created_by: number | null;
}): Promise<ContentJob | null>;
export declare function findJob(id: number): Promise<ContentJob | null>;
export declare function listJobs(): Promise<ContentJob[]>;
export declare function setJobStatus(id: number, status: string): Promise<ContentJob | null>;
export declare function addKeyword(params: {
    job_id: number;
    keyword: string;
    tone?: string;
    num_outlines?: number;
    category?: string | null;
    publish_status?: string;
}): Promise<ContentKeyword | null>;
export declare function findKeyword(id: number): Promise<ContentKeyword | null>;
export declare function listKeywordsForJob(job_id: number): Promise<ContentKeyword[]>;
export declare function updateKeyword(id: number, fields: Partial<ContentKeyword>): Promise<ContentKeyword | null>;
