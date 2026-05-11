/**
 * Web (MVC) Router
 * ─────────────────
 * All routes here return HTML pages or redirects.
 * Mounted at '/' in app.ts.
 *
 * Route map:
 *   GET  /                          → dashboard
 *   GET/POST /auth/*                → auth (login, logout, locale)
 *   GET/POST /sites/*               → site management
 *   GET/POST /content/*             → content jobs (HTML views)
 *   GET/POST /users/*               → user management
 *   GET      /logs                  → log viewer
 *   GET/POST /template              → site template editor
 *   GET      /articles/*            → articles list + detail pages
 */
import { Router } from 'express';

import authRoutes       from '../modules/auth/auth.page.routes';
import dashboardRoutes  from '../modules/dashboard/dashboard.page.routes';
import siteRoutes       from '../modules/sites/site.page.routes';
import contentRoutes    from '../modules/content/content.page.routes';
import userRoutes       from '../modules/users/user.page.routes';
import logRoutes        from '../modules/logs/log.page.routes';
import templateRoutes   from '../modules/template/template.page.routes';
import articleRoutes    from '../modules/articles/articles.page.routes';

const router = Router();

router.use('/auth',     authRoutes);
router.use('/',         dashboardRoutes);
router.use('/sites',    siteRoutes);
router.use('/content',  contentRoutes);
router.use('/users',    userRoutes);
router.use('/logs',     logRoutes);
router.use('/template', templateRoutes);
router.use('/articles', articleRoutes);

export default router;
