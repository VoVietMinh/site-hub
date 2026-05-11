import axios from 'axios';
import config from '../config';
import * as logRepo from '../modules/logs/log.repository';

export interface WebResult {
  link: string;
  title: string;
}

export interface ImageResult {
  url: string;           // primary imageUrl from Serper
  thumbnailUrl: string;  // encrypted tbn fallback always reachable
  filename: string;
  contentType: string;
  title: string;
}

const SERPER_BASE = 'https://google.serper.dev';

function serperHeaders(): Record<string, string> {
  return {
    'X-API-KEY':    config.images.serperApiKey,
    'Content-Type': 'application/json',
  };
}

// -- Web search --

export async function webSearch(query: string, num = 6): Promise<WebResult[]> {
  if (!config.images.serperApiKey) return [];
  try {
    const resp = await axios.post(
      SERPER_BASE + '/search',
      { q: query, num: Math.min(num * 2, 10) },
      { headers: serperHeaders(), timeout: 20000 }
    );
    const organic: Array<{ link?: string; title?: string }> = resp.data?.organic ?? [];
    return organic
      .filter((i) => i.link && !i.link.includes('youtube.com') && !i.link.includes('youtu.be'))
      .slice(0, num)
      .map((i) => ({ link: i.link!, title: i.title ?? '' }));
  } catch {
    return [];
  }
}

// -- Image search --

function buildImageResult(url: string, thumbnailUrl: string, title: string, ts: string, counter: number): ImageResult | null {
  if (!url) return null;
  const raw  = url.split('?')[0] ?? '';
  const ext  = (raw.split('.').pop() ?? 'jpg').toLowerCase();
  const safe = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const ct   = 'image/' + (safe === 'jpg' ? 'jpeg' : safe);
  return { url, thumbnailUrl, filename: `image-${ts}-${counter}.${safe}`, contentType: ct, title };
}

type SerperImageItem = {
  imageUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  imageWidth?: number;
  imageHeight?: number;
  source?: string;
  domain?: string;
};

export async function imageSearch(query: string, count = 9): Promise<ImageResult[]> {
  if (!config.images.serperApiKey) {
    await logRepo.write({ level: 'warn', category: 'cse',
      message: '[imageSearch] SERPER_API_KEY not configured -- skipping' });
    return [];
  }

  const ts      = new Date().toISOString().replace(/[:.]/g, '-');
  const out: ImageResult[] = [];
  const maxPages = Math.ceil(count / 10) + 1;

  for (let page = 0; page < maxPages && out.length < count; page++) {
    const body: Record<string, unknown> = { q: query, num: 10 };
    if (page > 0) body['page'] = page + 1;

    const endpoint = SERPER_BASE + '/images';

    // Log the outgoing request
    await logRepo.write({
      level: 'info', category: 'cse',
      message: '[imageSearch] REQUEST page=' + (page + 1) + ' query="' + query + '"',
      meta: { endpoint, body, apiKeySet: true },
    });

    try {
      const resp = await axios.post(endpoint, body,
        { headers: serperHeaders(), timeout: 20000 });

      const rawData = resp.data as Record<string, unknown>;
      const imgs = ((rawData?.['images'] ?? []) as SerperImageItem[]);

      // Log full response -- sample first 3 items + raw dump for field discovery
      await logRepo.write({
        level: 'info', category: 'cse',
        message: '[imageSearch] RESPONSE page=' + (page + 1) + ' http=' + resp.status + ' images_in_array=' + imgs.length,
        meta: {
          http_status:  resp.status,
          response_keys: Object.keys(rawData),
          images_count: imgs.length,
          sample_items: imgs.slice(0, 3).map((i) => ({
            imageUrl:     i.imageUrl,
            thumbnailUrl: i.thumbnailUrl,
            title:        i.title,
            source:       i.source,
            domain:       i.domain,
            imageWidth:   i.imageWidth,
            imageHeight:  i.imageHeight,
          })),
          raw_response_truncated: JSON.stringify(rawData).slice(0, 2000),
        },
      });

      if (!imgs.length) {
        await logRepo.write({ level: 'warn', category: 'cse',
          message: '[imageSearch] Empty images array on page ' + (page + 1) + ' -- stopping' });
        break;
      }

      let pageAdded = 0;
      for (const img of imgs) {
        if (out.length >= count) break;
        const url = img.imageUrl ?? '';
        if (!url) {
          await logRepo.write({ level: 'warn', category: 'cse',
            message: '[imageSearch] Item missing imageUrl thumbnailUrl=' + (img.thumbnailUrl ?? 'none') + ' domain=' + (img.domain ?? 'none') });
          continue;
        }
        const tnUrl = img.thumbnailUrl ?? '';
        const result = buildImageResult(url, tnUrl, img.title ?? query, ts, out.length + 1);
        if (result) { out.push(result); pageAdded++; }
      }

      await logRepo.write({ level: 'info', category: 'cse',
        message: '[imageSearch] page=' + (page + 1) + ' added=' + pageAdded + ' cumulative=' + out.length });

    } catch (err) {
      const e = err as Error & { response?: { status?: number; data?: unknown } };
      await logRepo.write({
        level: 'error', category: 'cse',
        message: '[imageSearch] REQUEST ERROR page=' + (page + 1) + ': ' + e.message,
        meta: {
          error_message: e.message,
          http_status:   e.response?.status,
          response_body: JSON.stringify(e.response?.data ?? {}).slice(0, 500),
        },
      });
      break;
    }
  }

  await logRepo.write({ level: 'info', category: 'cse',
    message: '[imageSearch] DONE query="' + query + '" total=' + out.length });

  return out;
}
