import { Request, Response } from 'express';
import * as sitesRepo from '../sites/site.repository';
import * as contentRepo from '../content/content.repository';
import * as logRepo from '../logs/log.repository';

export async function index(req: Request, res: Response): Promise<void> {
  const [sites, jobs, recentLogs] = await Promise.all([
    sitesRepo.listAll(),
    contentRepo.listJobs(),
    logRepo.list({ limit: 12, offset: 0 }),
  ]);
  const totalKeywords = (jobs as Array<{ num_keywords?: number }>).reduce(
    (acc, j) => acc + (j.num_keywords ?? 0), 0
  );
  res.render('dashboard/index', {
    title: res.__('dashboard.title'),
    sites, jobs, totalKeywords, recentLogs,
  });
}
