import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './articles.service';
import * as repo from './articles.repository';
import * as siteRepo from '../sites/site.repository';
import { WordPressClient } from '../../services/wpClient';

/** GET /api/articles/:id/status -- poll build status */
export const status = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  const article = await repo.findArticle(id);
  if (!article) return res.status(404).json({ error: 'not found' });
  res.json({ article });
});

/** POST /api/articles/keywords -- generate keyword articles from a topic */
export const generateKeywords = asyncHandler(async (req: Request, res: Response) => {
  const { site_id, topic, count, language, tone } = req.body as Record<string, string>;
  if (!topic) {
    return res.status(400).json({ error: 'topic is required' });
  }
  try {
    const result = await service.generateKeywords(
      String(topic).trim(),
      parseInt(count, 10) || 5,
      {
        siteId:   site_id ? parseInt(site_id, 10) : null,
        language: language || 'English',
        tone:     tone || undefined,
        userId:   req.session.user?.id ?? null,
      }
    );
    res.json(result);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/** POST /api/articles/:id/build -- trigger build pipeline */
export const build = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  const { publish_mode, scheduled_at } = req.body as Record<string, string>;
  try {
    const result = await service.buildArticle(id, publish_mode ?? 'immediate', scheduled_at ?? null);
    res.json(result);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/** POST /api/articles/:id/retry -- retry a FAILED article */
export const retry = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  try {
    const result = await service.retryArticle(id);
    res.json(result);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/** POST /api/articles/:id/publish -- publish article (optionally to a different site) */
export const publish = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params['id']!, 10);
  const body = req.body as Record<string, unknown>;
  const opts: { siteId?: number | null; categoryId?: number | null } = {};
  if (body['site_id']     != null) opts.siteId     = parseInt(String(body['site_id']),     10) || null;
  if (body['category_id'] != null) opts.categoryId = parseInt(String(body['category_id']), 10) || null;
  try {
    await service.publishArticle(id, opts);
    res.json({ ok: true });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/** POST /api/articles/:id/update -- update article fields */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  const allowed = ['category_id', 'scheduled_at', 'publish_mode', 'tone', 'outline_count', 'site_id', 'content_html', 'language'];
  const fields: Record<string, unknown> = {};
  const body = req.body as Record<string, unknown>;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      fields[k] = body[k] ?? null;
    }
  }
  try {
    const updated = await repo.updateArticle(id, fields as Parameters<typeof repo.updateArticle>[1]);
    res.json({ article: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/articles/sites/:siteId/check-connection -- test JWT auth for a site */
export const checkConnection = asyncHandler(async (req: Request, res: Response) => {
  const siteId = parseInt(req.params['siteId']!, 10);
  try {
    const site = await siteRepo.findById(siteId);
    if (!site) return res.status(404).json({ ok: false, error: 'Site not found' });
    const wp     = new WordPressClient(site);
    const result = await wp.testConnection();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message, via: 'unknown' });
  }
});

/** GET /api/articles/sites/:siteId/categories -- WP category list for dropdown */
export const siteCategories = asyncHandler(async (req: Request, res: Response) => {
  const siteId = parseInt(req.params['siteId']!, 10);
  try {
    const site = await siteRepo.findById(siteId);
    if (!site) return res.status(404).json({ error: 'Site not found', categories: [] });
    const wp = new WordPressClient(site);
    const categories = await wp.listCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, categories: [] });
  }
});

/** POST /api/articles/create -- manually create a single article */
export const createManual = asyncHandler(async (req: Request, res: Response) => {
  const { keyword, title, site_id, language, tone } = req.body as Record<string, string | undefined>;
  if (!keyword?.trim()) return res.status(400).json({ error: 'keyword is required' });
  try {
    const article = await repo.createArticle({
      keyword:  keyword.trim(),
      site_id:  site_id ? parseInt(site_id, 10) : null,
      user_id:  req.session.user?.id ?? null,
      language: language || 'English',
      tone:     tone || undefined,
    });
    if (article && title?.trim()) {
      await repo.updateArticle(article.id, { title: title.trim().slice(0, 255) });
    }
    const updated = article ? await repo.findArticle(article.id) : null;
    res.json({ article: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/articles/:id/publishes -- publish history for an article */
export const listPublishes = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  const publishes = await repo.listPublishesForArticle(id);
  res.json({ publishes });
});
