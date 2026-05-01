'use strict';

const repo      = require('./content.repository');
const sitesRepo = require('../sites/site.repository');
const cs        = require('../../services/contentService');
const logRepo   = require('../logs/log.repository');
const v         = require('../../utils/validators');

// ---------------------------------------------------------------------------
// Internal: resolve site record for a job (null if unbound)
// ---------------------------------------------------------------------------
function getSiteForJob(job) {
  if (!job || !job.site_id) return null;
  var { getDb } = require('../../infrastructure/db/connection');
  return getDb().prepare('SELECT * FROM sites WHERE id = ?').get(job.site_id) || null;
}

// ---------------------------------------------------------------------------
// Internal: get a JWT token for a site; throws with a clear message if creds missing
// ---------------------------------------------------------------------------
async function getSiteToken(site) {
  if (!site.wp_user || !site.wp_pass) {
    throw new Error(
      'WordPress API credentials not set for ' + site.domain +
      ' — go to Sites > ' + site.domain + ' and save WP Admin credentials first.'
    );
  }
  return cs.getWpToken(site.domain, !!site.ssl, site.wp_user, site.wp_pass);
}

// ---------------------------------------------------------------------------
// startJob
// ---------------------------------------------------------------------------
async function startJob({ topic, numKeywords, siteDomain, userId }) {
  if (!v.isNonEmptyString(topic, 200)) {
    var e = new Error('invalid topic'); e.status = 400; throw e;
  }
  if (!v.isPositiveInt(numKeywords, 100)) {
    var e2 = new Error('invalid numKeywords (1-100)'); e2.status = 400; throw e2;
  }

  var site = null;
  if (siteDomain) {
    v.assertDomain(siteDomain);
    site = sitesRepo.findByDomain(siteDomain);
  }

  var job = repo.createJob({
    site_id:     site ? site.id : null,
    topic:       topic,
    num_keywords: numKeywords,
    created_by:  userId
  });

  var keywords = await cs.generateKeywords({ topic: topic, count: numKeywords });
  for (var i = 0; i < keywords.length; i++) {
    repo.addKeyword({ job_id: job.id, keyword: keywords[i] });
  }

  await logRepo.write({
    level: 'info', category: 'content',
    message: 'job #' + job.id + ' created with ' + keywords.length + ' keywords for topic "' + topic + '"',
    userId: userId
  });

  return repo.findJob(job.id);
}

// ---------------------------------------------------------------------------
// configureKeyword
// ---------------------------------------------------------------------------
async function configureKeyword(id, opts) {
  opts = opts || {};
  var { getDb } = require('../../infrastructure/db/connection');
  var sets = [], params = [];
  if (opts.tone          !== undefined) { sets.push('tone = ?');           params.push(opts.tone); }
  if (opts.numOutlines   !== undefined) { sets.push('num_outlines = ?');   params.push(parseInt(opts.numOutlines, 10)); }
  if (opts.category      !== undefined) { sets.push('category = ?');       params.push(opts.category); }
  if (opts.publishStatus !== undefined) { sets.push('publish_status = ?'); params.push(opts.publishStatus); }
  if (opts.title         !== undefined) { sets.push('title = ?');          params.push(opts.title); }
  if (opts.content       !== undefined) { sets.push('content = ?');        params.push(opts.content); }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(id);
    getDb().prepare('UPDATE content_keywords SET ' + sets.join(', ') + ' WHERE id = ?').run(...params);
  }
  return repo.findKeyword(id);
}

// ---------------------------------------------------------------------------
// runKeyword  — full pipeline: outline → article → images → publish via REST API
// ---------------------------------------------------------------------------
async function runKeyword(keywordId, opts) {
  opts = opts || {};

  var k = repo.findKeyword(keywordId);
  if (!k) throw new Error('keyword not found');

  var job  = repo.findJob(k.job_id);
  if (!job) throw new Error('job not found');

  var site = getSiteForJob(job);

  repo.updateKeyword(keywordId, { status: 'OUTLINE' });

  try {
    // Step 1: outline
    var outline = await cs.generateOutline({
      keyword:    k.keyword,
      numOutlines: k.num_outlines,
      tone:       k.tone
    });
    repo.updateKeyword(keywordId, { outline: JSON.stringify(outline), status: 'ARTICLE' });

    // Step 2: article
    var article = await cs.generateArticle({
      keyword: k.keyword,
      outline: outline,
      tone:    k.tone
    });
    repo.updateKeyword(keywordId, { title: article.title, content: article.content, status: 'IMAGES' });

    // Step 3: images
    var images = await cs.fetchImages({ keyword: k.keyword, count: 3 });
    repo.updateKeyword(keywordId, { images_json: JSON.stringify(images), status: 'PUBLISHING' });

    // Step 4: publish via WP REST API
    if (site) {
      var token = await getSiteToken(site);
      var post  = await cs.publishToWordPress({
        domain:   site.domain,
        ssl:      !!site.ssl,
        token:    token,
        title:    article.title,
        content:  article.content,
        status:   k.publish_status || 'publish',
        category: k.category || null
      });
      repo.updateKeyword(keywordId, {
        status:        'PUBLISHED',
        post_link:     post.link || null,
        error_message: null
      });
      await logRepo.write({
        level: 'info', category: 'content',
        message: 'keyword #' + k.id + ' "' + k.keyword + '" published: ' + post.link
      });
    } else {
      repo.updateKeyword(keywordId, {
        status:        'GENERATED',
        error_message: 'No site bound to this job — content generated, ready to publish manually.'
      });
    }

    return repo.findKeyword(keywordId);
  } catch (err) {
    repo.updateKeyword(keywordId, { status: 'ERROR', error_message: err.message });
    await logRepo.write({
      level: 'error', category: 'content',
      message: 'keyword #' + k.id + ' failed: ' + err.message,
      meta: { stack: err.stack }
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// publishKeyword — manual publish for GENERATED / ERROR keywords
// ---------------------------------------------------------------------------
async function publishKeyword(keywordId) {
  var k = repo.findKeyword(keywordId);
  if (!k) throw new Error('keyword not found');
  if (!k.content) throw new Error('no content generated yet — run the keyword first');

  var job  = repo.findJob(k.job_id);
  var site = getSiteForJob(job);
  if (!site) throw new Error('no site bound to this job — cannot auto-publish');

  repo.updateKeyword(keywordId, { status: 'PUBLISHING', error_message: null });

  try {
    var token = await getSiteToken(site);
    var post  = await cs.publishToWordPress({
      domain:   site.domain,
      ssl:      !!site.ssl,
      token:    token,
      title:    k.title || k.keyword,
      content:  k.content,
      status:   k.publish_status || 'publish',
      category: k.category || null
    });
    repo.updateKeyword(keywordId, {
      status:        'PUBLISHED',
      post_link:     post.link || null,
      error_message: null
    });
    await logRepo.write({
      level: 'info', category: 'content',
      message: 'keyword #' + k.id + ' manually published: ' + post.link
    });
    return repo.findKeyword(keywordId);
  } catch (err) {
    repo.updateKeyword(keywordId, { status: 'ERROR', error_message: err.message });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// runJob
// ---------------------------------------------------------------------------
async function runJob(jobId, opts) {
  var job = repo.findJob(jobId);
  if (!job) throw new Error('job not found');
  repo.setJobStatus(jobId, 'RUNNING');
  var keywords = repo.listKeywordsForJob(jobId);
  for (var i = 0; i < keywords.length; i++) {
    try { await runKeyword(keywords[i].id, opts); } catch (_) {}
  }
  repo.setJobStatus(jobId, 'DONE');
  return repo.findJob(jobId);
}

// ---------------------------------------------------------------------------
// dispatchJobToN8n
// ---------------------------------------------------------------------------
async function dispatchJobToN8n(jobId) {
  var job      = repo.findJob(jobId);
  var keywords = repo.listKeywordsForJob(jobId);
  return cs.dispatchToN8n({
    payload: {
      job_id:   job.id,
      topic:    job.topic,
      keywords: keywords.map(function(k) {
        return {
          id: k.id, keyword: k.keyword, tone: k.tone,
          num_outlines: k.num_outlines, category: k.category,
          publish_status: k.publish_status
        };
      })
    }
  });
}

// ---------------------------------------------------------------------------
// getJobStatus — for live polling
// ---------------------------------------------------------------------------
function getJobStatus(jobId) {
  var job = repo.findJob(jobId);
  if (!job) return null;
  return { job: job, keywords: repo.listKeywordsForJob(jobId) };
}

// ---------------------------------------------------------------------------
// getJobCategories — fetch WP categories for a job's bound site
// ---------------------------------------------------------------------------
async function getJobCategories(jobId) {
  var job  = repo.findJob(jobId);
  var site = getSiteForJob(job);
  if (!site || !site.wp_user || !site.wp_pass) return [];
  try {
    var token = await cs.getWpToken(site.domain, !!site.ssl, site.wp_user, site.wp_pass);
    return await cs.wpApiGetCategories(site.domain, !!site.ssl, token);
  } catch (_) {
    return [];
  }
}

module.exports = {
  startJob,
  configureKeyword,
  runKeyword,
  publishKeyword,
  runJob,
  dispatchJobToN8n,
  getJobStatus,
  getJobCategories,
  repo
};
