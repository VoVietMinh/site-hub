import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as repo from './articles.repository';
import type { ArticlePublish } from '../../types';
import * as siteRepo from '../sites/site.repository';

/** GET /articles -- list all articles with optional filters */
export const index = asyncHandler(async (req: Request, res: Response) => {
  const siteId = req.query['site_id'] ? parseInt(req.query['site_id'] as string, 10) : null;
  const status  = (req.query['status'] as string) || null;
  const page    = Math.max(1, parseInt(req.query['page'] as string, 10) || 1);
  const limit   = 30;
  const offset  = (page - 1) * limit;

  const articles = siteId
    ? await repo.listArticlesForSite(siteId, { status, limit, offset })
    : await repo.listAllArticles({ status, limit, offset });

  const sites = await siteRepo.listAll();
  res.render('articles/index', {
    title: 'Articles', articles, sites,
    filters: { site_id: siteId, status }, page, limit,
  });
});

/** GET /articles/:id -- article detail page */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  const article = await repo.findArticle(id);
  if (!article) return res.status(404).render('errors/404', { title: 'Not Found' });

  const [artImages, site, sites, publishes] = await Promise.all([
    repo.listImagesForArticle(id),
    article.site_id ? siteRepo.findById(article.site_id as number) : Promise.resolve(null),
    siteRepo.listAll(),
    repo.listPublishesForArticle(id),
  ]);

  res.render('articles/detail', {
    title:     article.title ?? article.keyword,
    article, artImages, site, sites,
    publishes: publishes as ArticlePublish[],
    filters:   { site_id: (req.query['site_id'] as string) ?? null },
  });
});
