import type { Site } from '../types';
export declare class WordPressClient {
    private _site;
    private _domain;
    private _ssl;
    private _username;
    private _password;
    constructor(site: Site);
    private _base;
    private _axiosCfg;
    getToken(): Promise<string>;
    private _refreshToken;
    private _saveToken;
    private _request;
    uploadMedia(bytes: Buffer, filename: string, contentType: string): Promise<{
        id: number;
        source_url: string;
    }>;
    listCategories(): Promise<Array<{
        id: number;
        name: string;
        slug: string;
    }>>;
    findTagByName(name: string): Promise<{
        id: number;
    } | null>;
    createTag(name: string): Promise<{
        id: number;
    }>;
    findOrCreateTag(name: string): Promise<number>;
    findOrCreateCategory(name: string | null): Promise<number | null>;
    createPost(payload: Record<string, unknown>): Promise<{
        id: number;
        link: string;
    } & Record<string, unknown>>;
}
export default WordPressClient;
