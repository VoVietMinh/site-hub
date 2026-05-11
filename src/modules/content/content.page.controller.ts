import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './content.service';
import * as repo from './content.repository';
import * as sitesRepo from '../sites/site.repository';

export const index = asyncHandler(async (req: Request, res: Response) => {
  const jobs = await repo.listJobs();
  res.render('content/index', { title: res.__('content.title'), jobs });
});

export const showNew = asyncHandler(async (req: Request, res: Response) => {
  const sites = await sitesRepo.listAll();
  res.render('content/new', { title: res.__('content.newJob'), sites, values: {} });
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body as Record<string, string>;
  const { topic, num_keywords, site_domain } = b;
  try {
    const job = await service.startJob({
      topic, numKeywords: parseInt(num_keywords, 10),
      siteDomain: site_domain ?? null, userId: req.session.user!.id,
    });
    req.flash('success', res.__('content.jobCreated'));
    res.redirect('/content/' + (job as { id: number }).id);
  } catch (err) {
    const e = err as Error & { status?: number };
    req.flash('error', e.message);
    res.status(e.status ?? 500).render('content/new', {
      title: res.__('content.newJob'), sites: await sitesRepo.listAll(), values: req.body,
    });
  }
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const id  = parseInt(req.params['id']!, 10);
  const job = await repo.findJob(id);
  if (!job) return res.status(404).render('errors/404', { title: 'Not Found' });
  const keywords = await repo.listKeywordsForJob(id);
  res.render('content/detail', { title: 'Job #' + id, job, keywords });
});

export const keywordDetail = asyncHandler(async (req: Request, res: Response) => {
  const jobId   = parseInt(req.params['id']!, 10);
  const kid     = parseInt(req.params['kid']!, 10);
  const job     = await repo.findJob(jobId);
  const keyword = await repo.findKeyword(kid);
  if (!job || !keyword) return res.status(404).render('errors/404', { title: 'Not Found' });

  let site: { domain: string; ssl: boolean; wpUser: string | null; hasCreds: boolean } | null = null;
  if ((job as { site_id?: number }).site_id) {
    try {
      const raw = await sitesRepo.findById((job as { site_id: number }).site_id);
      if (raw) site = {
        domain: raw.domain as string, ssl: !!raw.ssl,
        wpUser: raw.wp_user as string | null,
        hasCreds: !!(raw.wp_user && raw.wp_pass),
      };
    } catch { /**/ }
  }
  res.render('content/keyword', { title: (keyword as { keyword: string }).keyword, job, keyword, site });
});

export const updateKeyword = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['kid']!, 10);
  const b  = req.body as Record<string, string>;
  await service.configureKeyword(id, {
    tone: b['tone'], numOutlines: b['num_outlines'],
    category: b['category'], publishStatus: b['publish_status'],
    title: b['title'], content: b['content'],
  });
  req.flash('success', res.__('content.keywordUpdated'));
  if (b['_return'] === 'keyword') {
    res.redirect('/content/' + req.params['id'] + '/keywords/' + req.params['kid']);
  } else {
    res.redirect('/content/' + req.params['id']);
  }
});

export const runJob = asyncHandler(async (req: Request, res: Response) => {
  const jobId = parseInt(req.params['id']!, 10);
  service.runJob(jobId, {}).catch(() => {});
  req.flash('info', res.__('content.jobStarted'));
  res.redirect('/content/' + jobId);
});

export const runKeyword = asyncHandler(async (req: Request, res: Response) => {
  const kid = parseInt(req.params['kid']!, 10);
  service.runKeyword(kid, {}).catch(() => {});
  req.flash('info', res.__('content.keywordStarted'));
  res.redirect('/content/' + req.params['id']);
});

export const publishKeyword = asyncHandler(async (req: Request, res: Response) => {
  const jobId = parseInt(req.params['id']!, 10);
  const kid   = parseInt(req.params['kid']!, 10);
  try {
    await service.publishKeyword(kid);
    req.flash('success', 'Published successfully');
  } catch (err) {
    req.flash('error', (err as Error).message);
  }
  res.redirect('/content/' + jobId);
});

export const dispatchN8n = asyncHandler(async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params['id']!, 10);
  const result = await service.dispatchJobToN8n(jobId);
  if ((result as { skipped?: boolean }).skipped) {
    req.flash('error', res.__('content.n8nNotConfigured'));
  } else {
    req.flash('success', res.__('content.n8nDispatched'));
  }
  res.redirect('/content/' + jobId);
});
