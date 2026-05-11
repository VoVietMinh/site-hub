import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as ctrl from './articles.api.controller';

const router = Router();
router.use(requireAuth);

// ── Static paths first (must precede /:id wildcard) ──────────────────────────
// POST /api/articles/keywords
router.post('/keywords', ctrl.generateKeywords);
// POST /api/articles/create
router.post('/create',   ctrl.createManual);
// GET  /api/articles/sites/:siteId/categories
router.get('/sites/:siteId/categories', ctrl.siteCategories);
// POST /api/articles/sites/:siteId/check-connection
router.post('/sites/:siteId/check-connection', ctrl.checkConnection);

// ── Dynamic article actions ───────────────────────────────────────────────────
// GET  /api/articles/:id/status
router.get('/:id/status',    ctrl.status);
// GET  /api/articles/:id/publishes
router.get('/:id/publishes', ctrl.listPublishes);
// POST /api/articles/:id/build
router.post('/:id/build',    ctrl.build);
// POST /api/articles/:id/retry
router.post('/:id/retry',    ctrl.retry);
// POST /api/articles/:id/publish
router.post('/:id/publish',  ctrl.publish);
// POST /api/articles/:id/update
router.post('/:id/update',   ctrl.update);

export default router;
