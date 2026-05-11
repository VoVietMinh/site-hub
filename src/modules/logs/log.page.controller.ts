import { Request, Response } from 'express';
import * as logRepo from './log.repository';

export async function index(req: Request, res: Response): Promise<void> {
  const limit    = Math.min(parseInt(req.query['limit'] as string, 10) || 200, 1000);
  const page     = Math.max(parseInt(req.query['page'] as string, 10) || 1, 1);
  const offset   = (page - 1) * limit;
  const category = (req.query['category'] as string) || null;
  const level    = (req.query['level'] as string) || null;

  const [items, total, categories] = await Promise.all([
    logRepo.list({ limit, offset, category, level }),
    logRepo.count({ category, level }),
    logRepo.distinctCategories(),
  ]);

  res.render('logs/index', {
    title:      res.__('logs.title'),
    items, total, page, limit,
    pages:      Math.max(Math.ceil(total / limit), 1),
    filter:     { category, level },
    categories,
  });
}
