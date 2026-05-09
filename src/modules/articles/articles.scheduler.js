'use strict';

/**
 * Articles scheduler — drains QUEUED articles past their scheduled_at.
 * Runs every 60 seconds, claims up to 5 articles atomically, publishes them.
 */

const repo    = require('./articles.repository');
const service = require('./articles.service');
const logRepo = require('../logs/log.repository');

let _timer = null;

async function tick() {
  let rows;
  try {
    rows = await repo.claimScheduledArticles(5);
  } catch (err) {
    console.error('[scheduler] claimScheduledArticles error:', err.message);
    return;
  }

  if (!rows || !rows.length) return;

  for (const article of rows) {
    service.publishArticle(article.id).catch(function(err) {
      console.error('[scheduler] publish failed for article #' + article.id + ':', err.message);
    });
  }

  await logRepo.write({
    level: 'info',
    category: 'articles',
    message: '[scheduler] Dispatched ' + rows.length + ' scheduled article(s) for publishing'
  }).catch(function() {});
}

function start(intervalMs) {
  if (_timer) return;
  intervalMs = intervalMs || 60000;
  _timer = setInterval(function() {
    tick().catch(function(err) {
      console.error('[scheduler] tick error:', err.message);
    });
  }, intervalMs);
  // unref so the timer doesn't keep the process alive during shutdown
  if (_timer.unref) _timer.unref();
  console.log('[scheduler] Articles scheduler started (interval: ' + intervalMs + 'ms)');
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop };
