import axios from 'axios';
import * as logRepo from '../modules/logs/log.repository';
import type { ImageResult } from './cse';

/** A fully-validated image ready to embed as an <img> tag. */
export interface ValidatedImage {
  url:   string;  // final reachable URL (imageUrl or thumbnailUrl whichever passed)
  title: string;
}

const MAX_BYTES = 10 * 1024 * 1024;  // 10 MB

/** HEAD-check a URL: must return HTTP 200 with content-type image/*. */
async function headOk(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const r = await axios.head(url, { timeout: 8000, maxRedirects: 5, validateStatus: () => true });
    if (r.status !== 200) return false;
    const ct = String(r.headers['content-type'] ?? '').toLowerCase();
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

/** GET a URL: must return valid bytes under 10 MB with content-type image/*. */
async function getOk(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer', timeout: 15000,
      maxRedirects: 5, maxContentLength: MAX_BYTES,
      validateStatus: () => true,
    });
    if (r.status !== 200) return false;
    const ct = String(r.headers['content-type'] ?? '').toLowerCase();
    if (!ct.startsWith('image/')) return false;
    const len = (r.data as Buffer).length;
    return len > 0 && len <= MAX_BYTES;
  } catch {
    return false;
  }
}

/**
 * Validate and deduplicate a list of Serper image results.
 * For each item:
 *   1. HEAD-validate imageUrl; fallback to thumbnailUrl.
 *   2. GET-validate whichever URL passed HEAD; fallback to thumbnailUrl.
 * Returns only fully-valid images with their final usable URL.
 */
export async function validateImages(imageList: ImageResult[]): Promise<ValidatedImage[]> {
  // Deduplicate by imageUrl
  const seen = new Set<string>();
  const deduped = imageList.filter((img) => {
    const key = img.url || img.thumbnailUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await logRepo.write({ level: 'info', category: 'cse',
    message: 'IMAGE.FILTER raw=' + imageList.length + ' after_dedupe=' + deduped.length });

  const results: ValidatedImage[] = [];

  for (const img of deduped) {
    const primary   = img.url;
    const fallback  = img.thumbnailUrl;

    // -- HEAD validate --
    let headUrl = '';
    const headPrimary = await headOk(primary);
    await logRepo.write({ level: 'info', category: 'cse',
      message: 'IMAGE.HEAD_VALIDATE url=' + primary.slice(0, 80) + ' ok=' + headPrimary });
    if (headPrimary) {
      headUrl = primary;
    } else if (fallback) {
      const headFb = await headOk(fallback);
      await logRepo.write({ level: 'info', category: 'cse',
        message: 'IMAGE.HEAD_VALIDATE fallback=' + fallback.slice(0, 80) + ' ok=' + headFb });
      if (headFb) headUrl = fallback;
    }
    if (!headUrl) continue;  // both failed HEAD

    // -- GET validate --
    let getUrl = '';
    const getPrimary = await getOk(headUrl);
    await logRepo.write({ level: 'info', category: 'cse',
      message: 'IMAGE.DOWNLOAD url=' + headUrl.slice(0, 80) + ' ok=' + getPrimary });
    if (getPrimary) {
      getUrl = headUrl;
    } else if (fallback && headUrl !== fallback) {
      const getFb = await getOk(fallback);
      await logRepo.write({ level: 'info', category: 'cse',
        message: 'IMAGE.DOWNLOAD fallback=' + fallback.slice(0, 80) + ' ok=' + getFb });
      if (getFb) getUrl = fallback;
    }
    if (!getUrl) continue;  // both failed GET

    results.push({ url: getUrl, title: img.title });
  }

  await logRepo.write({ level: 'info', category: 'cse',
    message: 'IMAGE.FILTER raw=' + imageList.length + ' kept=' + results.length });

  return results;
}
