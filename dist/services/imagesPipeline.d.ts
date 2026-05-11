import type { ImageResult } from './cse';
export interface DownloadedImage extends ImageResult {
    bytes: Buffer;
}
export declare function validateAndDownload(imageList: ImageResult[]): Promise<DownloadedImage[]>;
