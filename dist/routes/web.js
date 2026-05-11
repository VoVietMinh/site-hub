"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const express_1 = require("express");
const auth_page_routes_1 = __importDefault(require("../modules/auth/auth.page.routes"));
const dashboard_page_routes_1 = __importDefault(require("../modules/dashboard/dashboard.page.routes"));
const site_page_routes_1 = __importDefault(require("../modules/sites/site.page.routes"));
const content_page_routes_1 = __importDefault(require("../modules/content/content.page.routes"));
const user_page_routes_1 = __importDefault(require("../modules/users/user.page.routes"));
const log_page_routes_1 = __importDefault(require("../modules/logs/log.page.routes"));
const template_page_routes_1 = __importDefault(require("../modules/template/template.page.routes"));
const articles_page_routes_1 = __importDefault(require("../modules/articles/articles.page.routes"));
const router = (0, express_1.Router)();
router.use('/auth', auth_page_routes_1.default);
router.use('/', dashboard_page_routes_1.default);
router.use('/sites', site_page_routes_1.default);
router.use('/content', content_page_routes_1.default);
router.use('/users', user_page_routes_1.default);
router.use('/logs', log_page_routes_1.default);
router.use('/template', template_page_routes_1.default);
router.use('/articles', articles_page_routes_1.default);
exports.default = router;
//# sourceMappingURL=web.js.map