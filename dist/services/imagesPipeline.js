"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndDownload = validateAndDownload;
const axios_1 = __importDefault(require("axios"));
const MAX_FILE_SIZE = 10 * 1024 * 1024;
async function headValidate(url) {
    try {
        const resp = await axios_1.default.head(url, {
            timeout: 10000, maxRedirects: 5,
            validateStatus: (s) => s < 500,
        });
        if (resp.status !== 200)
            return false;
        const ct = (resp.headers['content-type'] || '').toLowerCase();
        return !ct.startsWith('text/html');
    }
    catch {
        return false;
    }
}
async function downloadBytes(url) {
    try {
        const resp = await axios_1.default.get(url, {
            responseType: 'arraybuffer', timeout: 30000,
            maxRedirects: 5, maxContentLength: MAX_FILE_SIZE,
        });
        return Buffer.from(resp.data);
    }
    catch {
        return null;
    }
}
async function validateAndDownload(imageList) {
    const results = [];
    for (const img of imageList) {
        const ok = await headValidate(img.url);
        if (!ok)
            continue;
        const bytes = await downloadBytes(img.url);
        if (!bytes || bytes.length === 0)
            continue;
        results.push({ ...img, bytes });
    }
    return results;
}
//# sourceMappingURL=imagesPipeline.js.map