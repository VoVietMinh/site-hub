"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSearch = webSearch;
exports.imageSearch = imageSearch;
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../config"));
const BASE = 'https://www.googleapis.com/customsearch/v1';
async function webSearch(query, num = 6) {
    if (!config_1.default.cse.apiKey || !config_1.default.cse.cx)
        return [];
    try {
        const resp = await axios_1.default.get(BASE, {
            params: { q: query, cx: config_1.default.cse.cx, num, key: config_1.default.cse.apiKey },
            timeout: 20000,
        });
        const items = resp.data?.items ?? [];
        return items
            .filter((i) => !i.link.includes('youtube.com') && !i.link.includes('youtu.be'))
            .slice(0, 3)
            .map((i) => ({ link: i.link, title: i.title ?? '' }));
    }
    catch {
        return [];
    }
}
async function imageSearch(query, count = 9) {
    if (!config_1.default.cse.apiKey || !config_1.default.cse.cx)
        return [];
    const isImage = (u) => /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
    const seen = new Set();
    const out = [];
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let counter = 1;
    const maxPages = Math.ceil(count / 10) + 1;
    for (let page = 0; page < maxPages && out.length < count; page++) {
        const start = page * 10 + 1;
        try {
            const resp = await axios_1.default.get(BASE, {
                params: {
                    searchType: 'image', imgSize: 'large', imgType: 'photo',
                    fileType: 'jpg', safe: 'active', q: query,
                    cx: config_1.default.cse.cx, num: 10, start, key: config_1.default.cse.apiKey,
                },
                timeout: 20000,
            });
            const items = resp.data?.items ?? [];
            if (!items.length)
                break;
            for (const img of items) {
                if (out.length >= count)
                    break;
                const url = img.link;
                if (!url || !isImage(url))
                    continue;
                const fname = url.split('/').pop()?.split('?')[0] ?? '';
                if (seen.has(fname))
                    continue;
                seen.add(fname);
                const ext = fname.split('.').pop()?.toLowerCase() ?? 'jpg';
                const ct = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
                out.push({ url, filename: `image-${ts}-${counter}.${ext}`, contentType: ct, title: img.title ?? query });
                counter++;
            }
        }
        catch {
            break;
        }
    }
    return out;
}
//# sourceMappingURL=cse.js.map