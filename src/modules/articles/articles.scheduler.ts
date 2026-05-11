import { query } from '../../infrastructure/db/connection';
import * as repo from './articles.repository';
import { publishArticle, buildArticle } from './articles.service';
import * as logRepo from '../logs/log.repository';
import type { Article } from '../../types';

let _timer: ReturnType<typeof setInterval> | null = null;

// ── On boot: recover articles whose build died mid-flight ─────────────────────
// Any article stuck in BUILDING when the process died must be reset to PENDING
// so they can be retried. PUBLISHING articles are similarly reset to READY.
export async function recoverStuckArticles(): Promise<void> {
  try {
    const buildingRows = await query<Article>(
      "UPDATE articles SET status='PENDING', build_step=NULL, updated_at=NOW() WHERE status='BUILDING' RETURNING id, keyword"
    );
    const publishingRows = await query<Article>(
      "UPDATE articles SET status='READY', updated_at=NOW() WHERE status='PUBLISHING' RETURNING id, keyword"
    );

    const totalRecovered = (buildingRows?.length ?? 0) + (publishingRows?.length ?? 0);

    if (totalRecovered > 0) {
      const ids = [
        ...(buildingRows ?? []).map((a) => '#' + a.id + ' (' + a.keyword + ') BUILDING→PENDING'),
        ...(publishingRows ?? []).map((a) => '#' + a.id + ' (' + a.keyword + ') PUBLISHING→READY'),
      ].join(', ');
      await logRepo.write({
        level: 'warn', category: 'articles',
        message: `[scheduler] Recovered ${totalRecovered} stuck article(s) on startup: ${ids}`,
      });
      console.log('[scheduler] Recovered ' + totalRecovered + ' stuck article(s): ' + ids);
    }
  } catch (err) {
    console.error('[scheduler] recoverStuckArticles error:', (err as Error).message);
  }
}

// ── Periodic tick: dispatch scheduled publish + auto-retry PENDING ─────────────
async function tick(): Promise<void> {
  // 1. Publish any QUEUED articles whose scheduled_at has arrived
  let rows;
  try {
    rows = await repo.claimScheduledArticles(5);
  } catch (err) {
    console.error('[scheduler] claimScheduledArticles error:', (err as Error).message);
    return;
  }
  if (rows?.length) {
    for (const article of rows) {
      publishArticle(article.id as number).catch((err: unknown) => {
        console.error('[scheduler] publish failed for article #' + article.id + ':', (err as Error).message);
      });
    }
    await logRepo.write({
      level: 'info', category: 'articles',
      message: `[scheduler] Dispatched ${rows.length} scheduled article(s) for publishing`,
    }).catch(() => {});
  }

  // 2. Auto-build any PENDING articles that haven't been manually triggered
  //    (articles created by generateKeywords are PENDING and need a build trigger)
  try {
    const pending = await query<Article>(
      `SELECT * FROM articles WHERE status='PENDING'
        AND created_at < NOW() - INTERVAL '10 seconds'
        ORDER BY created_at ASC LIMIT 3`
    );
    for (const article of (pending ?? [])) {
      buildArticle(article.id as number, article.publish_mode as string ?? 'immediate').catch((err: unknown) => {
        console.error('[scheduler] auto-build failed for article #' + article.id + ':', (err as Error).message);
      });
    }
  } catch (err) {
    console.error('[scheduler] auto-build check error:', (err as Error).message);
  }
}

export function start(intervalMs = 30000): void {
  if (_timer) return;

  // Recover stuck articles immediately on startup
  recoverStuckArticles().catch(() => {});

  _timer = setInterval(() => {
    tick().catch((err: unknown) => {
      console.error('[scheduler] tick error:', (err as Error).message);
    });
  }, intervalMs);
  if ('unref' in _timer) (_timer as { unref(): void }).unref();
  console.log('[scheduler] Articles scheduler started (interval: ' + intervalMs + 'ms)');
}

export function stop(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
