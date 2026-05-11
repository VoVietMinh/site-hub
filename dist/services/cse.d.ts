export interface WebResult {
    link: string;
    title: string;
}
export interface ImageResult {
    url: string;
    filename: string;
    contentType: string;
    title: string;
}
export declare function webSearch(query: string, num?: number): Promise<WebResult[]>;
export declare function imageSearch(query: string, count?: number): Promise<ImageResult[]>;
