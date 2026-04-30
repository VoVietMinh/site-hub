'use strict';

/**
 * Orchestrates the full SEO content generation flow.
 *
 *  step 1: generate keywords for a topic
 *  step 2: persist keywords with per-keyword config (tone, outlines, category, status)
 *  step 3: for each keyword:
 *            - generate outline
 *            - generate article
 *            - fetch images
 *            - publish via WordPress REST API
 *            - update status + link
 *
 * If N8N_WEBHOOK_URL is configured the service can also delegate the entire
 * keyword batch to the n8n workflow in one call.
 */

const repo = require('./content.repository');
const sitesRepo = require('../sites/site.repository');
const cs = require('../../services/contentService');
const logRepo = require('../logs/log.repository');
const v = require('../../utils/validators');

async function startJob({ topic, numKeywords, siteDomain, userId }) {
  if (!v.isNonEmptyString(topic, 200)) {
    const e = new Error('invalid topic'); e.status = 400; throw e;
  }
  if (!v.isPositiveInt(numKeywords, 100)) {
    const e = new Error('invalid numKeywords (1-100)'); e.status = 400; throw e;
  }

  let site = null;
  if (siteDomain) {
    v.assertDomain(siteDomain);
    site = sitesRepo.findByDomain(siteDomain);
  }

  const job = repo.createJob({
    site_id: site ? site.id : null,
    topic,
    num_keywords: numKeywords,
    created_by: userId
  });

  const keywords = await cs.generateKeywords({ topic, count: numKeywords });
  for (const kw of keywords) {
    repo.addKeyword({ job_id: job.id, keyword: kw });
  }

  await logRepo.write({
    level: 'info',
    category: 'content',
    message: `job #${job.id} created with ${keywords.length} keywords for topic "${topic}"`,
    userId
  });

  return repo.findJob(job.id);
}

async function configureKeyword(id, { tone, numOutlines, category, publishStatus, title }) {
  const fields = {};
  if (tone) fields.tone = tone;
  if (numOutlines) fields.num_outlines = parseInt(numOutlines, 10);
  if (category !== undefined) fields.category = category;
  if (publishStatus) fields.publish_status = publishStatus;
  if (title !== undefined) fields.title = title;

  // We bypass updateKeyword's allow-list for tone / num_outlines / category / publish_status
  // because those columns are also user-config — so do a small direct update here.
  const { getDb } = require('../../infrastructure/db/connection');
  const sets = [];
  const params = [];
  if (fields.tone) { sets.push('tone = ?'); params.push(fields.tone); }
  if (fields.num_outlines) { sets.push('num_outlines = ?'); params.push(fields.num_outlines); }
  if (fields.category !== undefined) { sets.push('category = ?'); params.push(fields.category); }
  if (fields.publish_status) { sets.push('publish_status = ?'); params.push(fields.publish_status); }
  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(id);
    getDb().prepare(`UPDATE content_keywords SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
  return repo.findKeyword(id);
}

/**
 * Run the generation/publish pipeline for one keyword. This is intentionally
 * sequential (not bulk) so the UI can stream status updates and so failures
 * don't poison the whole batch.
 */
async function runKeyword(keywordId, { wpCreds } = {}) {
  const k = repo.findKeyword(keywordId);
  if (!k) throw new Error('keyword not found');

  const job = repo.findJob(k.job_id);
  if (!job) throw new Error('job not found');

  // Resolve site
  let site = null;
  if (job.site_id) {
    const { getDb } = require('../../infrastructure/db/connection');
    site = getDb().prepare('SELECT * FROM sites WHERE id = ?').get(job.site_id);
  }

  repo.updateKeyword(keywordId, { status: 'OUTLINE' });

  try {
    const outline = await cs.generateOutline({
      keyword: k.keyword,
      numOutlines: k.num_outlines,
      tone: k.tone
    });
    repo.updateKeyword(keywordId, {
      outline: JSON.stringify(outline),
      status: 'ARTICLE'
    });

    const article = await cs.generateArticle({
      keyword: k.keyword,
      outline,
      tone: k.tone
    });
    repo.updateKeyword(keywordId, {
      title: article.title,
      content: article.content,
      status: 'IMAGES'
    });

    const images = await cs.fetchImages({ keyword: k.keyword, count: 3 });
    repo.updateKeyword(keywordId, {
      images_json: JSON.stringify(images),
      status: 'PUBLISHING'
    });

    if (!site) {
      repo.updateKeyword(keywordId, {
        status: 'GENERATED',
        error_message: 'No site bound to this job — generation done, publishing skipped.'
      });
      return repo.findKeyword(keywordId);
    }

    if (!wpCreds || !wpCreds.username || !(wpCreds.password || wpCreds.applicationPassword)) {
      repo.updateKeyword(keywordId, {
        status: 'GENERATED',
        error_message: 'WP credentials not provided — publishing skipped.'
      });
      return repo.findKeyword(keywordId);
    }

    const post = await cs.publishToWordPress({
      domain: site.domain,
      ssl: !!site.ssl,
      username: wpCreds.username,
      password: wpCreds.password,
      applicationPassword: wpCreds.applicationPassword,
      title: article.title,
      content: article.content,
      status: k.publish_status || 'publish',
      category: k.category
    });

    repo.updateKeyword(keywordId, {
      status: 'PUBLISHED',
      post_link: post.link || null,
      error_message: null
    });

    await logRepo.write({
      level: 'info',
      category: 'content',
      message: `keyword #${k.id} "${k.keyword}" published: ${post.link}`
    });

    return repo.findKeyword(keywordId);
  } catch (err) {
    repo.updateKeyword(keywordId, {
      status: 'ERROR',
      error_message: err.message
    });
    await logRepo.write({
      level: 'error',
      category: 'content',
      message: `keyword #${k.id} failed: ${err.message}`,
      meta: { stack: err.stack }
    });
    throw err;
  }
}

async function runJob(jobId, opts) {
  const job = repo.findJob(jobId);
  if (!job) throw new Error('job not found');
  repo.setJobStatus(jobId, 'RUNNING');
  const keywords = repo.listKeywordsForJob(jobId);
  for (const k of keywords) {
    try {
      await runKeyword(k.id, opts);
    } catch (_) { /* continue with next keyword */ }
  }
  repo.setJobStatus(jobId, 'DONE');
  return repo.findJob(jobId);
}

async function dispatchJobToN8n(jobId) {
  const job = repo.findJob(jobId);
  const keywords = repo.listKeywordsForJob(jobId);
  return cs.dispatchToN8n({
    payload: {
      job_id: job.id,
      topic: job.topic,
      keywords: keywords.map((k) => ({
        id: k.id,
        keyword: k.keyword,
        tone: k.tone,
        num_outlines: k.num_outlines,
        category: k.category,
        publish_status: k.publish_status
      }))
    }
  });
}

module.exports = {
  startJob,
  configureKeyword,
  runKeyword,
  runJob,
  dispatchJobToN8n,
  repo
};
