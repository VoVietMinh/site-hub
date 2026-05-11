/**
 * API Router
 * ──────────
 * All routes here return JSON.
 * Mounted at '/api' in app.ts.
 *
 * Route map:
 *   POST /api/articles/keywords                   → generate keyword articles
 *   GET  /api/articles/sites/:siteId/categories   → WP categories for site
 *   GET  /api/articles/:id/status                 → article build status
 *   POST /api/articles/:id/build                  → trigger build
 *   POST /api/articles/:id/retry                  → retry failed article
 *   POST /api/articles/:id/publish                → manual publish
 *   POST /api/articles/:id/update                 → update fields
 *
 *   GET  /api/content/:id/categories              → WP categories for job
 *   GET  /api/content/:id/status                  → job + keyword status
 *   GET  /api/content/:id/check-connection        → test WP connectivity
 */
import { Router } from 'express';

import articleApiRoutes from '../modules/articles/articles.api.routes';
import contentApiRoutes from '../modules/content/content.api.routes';

const router = Router();

router.use('/articles', articleApiRoutes);
router.use('/content',  contentApiRoutes);

export default router;
