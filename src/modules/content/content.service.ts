import * as repo from './content.repository';
import * as sitesRepo from '../sites/site.repository';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- legacy JS service, no types
import * as cs from '../../services/contentService';
import * as logRepo from '../logs/log.repository';
import * as v from '../../utils/validators';
import type { ContentJob, ContentKeyword, Site } from '../../types';

async function getSiteForJob(job: ContentJob | null): Promise<Site | null> {
  if (!job || !job.site_id) return null;
  return sitesRepo.findById(job.site_id as number);
}

async function getSiteToken(site: Site): Promise<string> {
  if (!site.wp_user || !site.wp_pass) {
    throw new Error('WordPress API credentials not set for ' + site.domain +
      ' -- go to Sites > ' + site.domain + ' and save WP Admin credentials first.');
  }
  return cs.getWpToken(site.domain as string, !!site.ssl, site.wp_user as string, site.wp_pass as string);
}

export async function startJob(params: {
  topic: string; numKeywords: number; siteDomain?: string | null; userId: number;
}): Promise<ContentJob | null> {
  const { topic, numKeywords, siteDomain, userId } = params;
  if (!v.isNonEmptyString(topic, 200)) throw Object.assign(new Error('invalid topic'), { status: 400 });
  if (!v.isPositiveInt(numKeywords, 100)) throw Object.assign(new Error('invalid numKeywords (1-100)'), { status: 400 });

  let site: Site | null = null;
  if (siteDomain) { v.assertDomain(siteDomain); site = await sitesRepo.findByDomain(siteDomain); }

  const job = await repo.createJob({
    site_id: site?.id ?? null, topic, num_keywords: numKeywords, created_by: userId,
  });
  if (!job) throw new Error('Failed to create job');

  const keywords = await cs.generateKeywords({ topic, count: numKeywords }) as string[];
  for (const keyword of keywords) {
    await repo.addKeyword({ job_id: job.id as number, keyword });
  }

  await logRepo.write({ level: 'info', category: 'content',
    message: `job #${job.id} created with ${keywords.length} keywords for topic "${topic}"`, userId });
  return repo.findJob(job.id as number);
}

export async function configureKeyword(id: number, opts: {
  tone?: string; numOutlines?: string | number; category?: string;
  publishStatus?: string; title?: string; content?: string;
}): Promise<ContentKeyword | null> {
  const fields: Partial<ContentKeyword> = {};
  if (opts.tone          !== undefined) fields.tone           = opts.tone;
  if (opts.numOutlines   !== undefined) (fields as Record<string, unknown>)['num_outlines'] = parseInt(String(opts.numOutlines), 10);
  if (opts.category      !== undefined) fields.category       = opts.category;
  if (opts.publishStatus !== undefined) (fields as Record<string, unknown>)['publish_status'] = opts.publishStatus;
  if (opts.title         !== undefined) fields.title          = opts.title;
  if (opts.content       !== undefined) fields.content        = opts.content;
  return repo.updateKeyword(id, fields);
}

export async function runKeyword(keywordId: number, _opts: Record<string, unknown> = {}): Promise<ContentKeyword | null> {
  const k = await repo.findKeyword(keywordId);
  if (!k) throw new Error('keyword not found');
  const job  = await repo.findJob(k.job_id as number);
  const site = await getSiteForJob(job);

  await repo.updateKeyword(keywordId, { status: 'OUTLINE' });
  try {
    const outline = await cs.generateOutline({ keyword: k.keyword, numOutlines: k.num_outlines, tone: k.tone });
    await repo.updateKeyword(keywordId, { outline: JSON.stringify(outline), status: 'ARTICLE' });

    const article = await cs.generateArticle({ keyword: k.keyword, outline, tone: k.tone }) as { title: string; content: string };
    await repo.updateKeyword(keywordId, { title: article.title, content: article.content, status: 'IMAGES' });

    const imgs = await cs.fetchImages({ keyword: k.keyword as string, count: 3 });
    await repo.updateKeyword(keywordId, { images_json: JSON.stringify(imgs), status: 'PUBLISHING' });

    if (site) {
      const token = await getSiteToken(site);
      const post  = await cs.publishToWordPress({
        domain: site.domain, ssl: !!site.ssl, token,
        title: article.title, content: article.content,
        status: k.publish_status ?? 'publish', category: k.category ?? null,
      }) as { link?: string };
      await repo.updateKeyword(keywordId, { status: 'PUBLISHED', post_link: post.link ?? null, error_message: null });
      await logRepo.write({ level: 'info', category: 'content',
        message: `keyword #${k.id} "${k.keyword}" published: ${post.link}` });
    } else {
      await repo.updateKeyword(keywordId, {
        status: 'GENERATED',
        error_message: 'No site bound to this job -- content generated, ready to publish manually.',
      });
    }
    return repo.findKeyword(keywordId);
  } catch (err) {
    await repo.updateKeyword(keywordId, { status: 'ERROR', error_message: (err as Error).message });
    await logRepo.write({ level: 'error', category: 'content',
      message: `keyword #${k.id} failed: ${(err as Error).message}` });
    throw err;
  }
}

export async function publishKeyword(keywordId: number): Promise<ContentKeyword | null> {
  const k = await repo.findKeyword(keywordId);
  if (!k) throw new Error('keyword not found');
  if (!k.content) throw new Error('no content generated yet -- run the keyword first');
  const job  = await repo.findJob(k.job_id as number);
  const site = await getSiteForJob(job);
  if (!site) throw new Error('no site bound to this job -- cannot auto-publish');

  await repo.updateKeyword(keywordId, { status: 'PUBLISHING', error_message: null });
  try {
    const token = await getSiteToken(site);
    const post  = await cs.publishToWordPress({
      domain: site.domain, ssl: !!site.ssl, token,
      title: (k.title ?? k.keyword) as string, content: k.content as string,
      status: (k.publish_status ?? 'publish') as string, category: k.category as string | null,
    }) as { link?: string };
    await repo.updateKeyword(keywordId, { status: 'PUBLISHED', post_link: post.link ?? null, error_message: null });
    await logRepo.write({ level: 'info', category: 'content', message: `keyword #${k.id} manually published: ${post.link}` });
    return repo.findKeyword(keywordId);
  } catch (err) {
    await repo.updateKeyword(keywordId, { status: 'ERROR', error_message: (err as Error).message });
    throw err;
  }
}

export async function runJob(jobId: number, opts: Record<string, unknown>): Promise<ContentJob | null> {
  const job = await repo.findJob(jobId);
  if (!job) throw new Error('job not found');
  await repo.setJobStatus(jobId, 'RUNNING');
  const keywords = await repo.listKeywordsForJob(jobId);
  for (const kw of keywords) {
    try { await runKeyword(kw.id as number, opts); } catch { /**/ }
  }
  await repo.setJobStatus(jobId, 'DONE');
  return repo.findJob(jobId);
}

export async function dispatchJobToN8n(jobId: number): Promise<unknown> {
  const job      = await repo.findJob(jobId);
  const keywords = await repo.listKeywordsForJob(jobId);
  return cs.dispatchToN8n({
    payload: {
      job_id: job?.id, topic: job?.topic,
      keywords: keywords.map((k) => ({
        id: k.id, keyword: k.keyword, tone: k.tone,
        num_outlines: k.num_outlines, category: k.category, publish_status: k.publish_status,
      })),
    },
  });
}

export async function getJobStatus(jobId: number): Promise<{ job: ContentJob; keywords: ContentKeyword[] } | null> {
  const job = await repo.findJob(jobId);
  if (!job) return null;
  return { job, keywords: await repo.listKeywordsForJob(jobId) };
}

export async function getJobCategories(jobId: number): Promise<{ categories: unknown[]; error: string | null }> {
  const job  = await repo.findJob(jobId);
  const site = await getSiteForJob(job);
  if (!site) return { categories: [], error: 'No WordPress site bound to this job.' };
  if (!site.wp_user || !site.wp_pass) {
    return { categories: [], error: 'No WordPress credentials saved for ' + site.domain + ' -- go to Sites and save them first.' };
  }
  try {
    const token      = await getSiteToken(site);
    const categories = await cs.wpApiGetCategories(site.domain as string, !!site.ssl, token);
    return { categories: categories as unknown[], error: null };
  } catch (err) {
    return { categories: [], error: (err as Error).message };
  }
}

export async function checkJobConnection(jobId: number): Promise<{
  ok: boolean; domain: string; ssl: boolean; wpUser: string | null;
  hasCreds: boolean; siteInfo: unknown | null; categories: unknown[]; error: string | null;
}> {
  const job  = await repo.findJob(jobId);
  const site = await getSiteForJob(job);

  if (!site) return { ok: false, domain: '', ssl: false, wpUser: null, hasCreds: false, siteInfo: null, categories: [], error: 'No WordPress site bound to this job.' };

  const result = {
    ok: false, domain: site.domain as string, ssl: !!site.ssl,
    wpUser: (site.wp_user as string | null) ?? null,
    hasCreds: !!(site.wp_user && site.wp_pass),
    siteInfo: null as unknown, categories: [] as unknown[], error: null as string | null,
  };

  if (!site.wp_user || !site.wp_pass) {
    result.error = 'WordPress API credentials not set -- go to Sites > ' + site.domain + ' and save them first.';
    return result;
  }

  try {
    const token       = await getSiteToken(site);
    result.siteInfo   = await cs.getWpSiteInfo(site.domain as string, !!site.ssl, token);
    result.categories = await cs.wpApiGetCategories(site.domain as string, !!site.ssl, token) as unknown[];
    result.ok         = true;
  } catch (err) {
    result.error = (err as Error).message;
  }
  return result;
}
