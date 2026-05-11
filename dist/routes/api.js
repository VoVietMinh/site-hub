"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const express_1 = require("express");
const articles_api_routes_1 = __importDefault(require("../modules/articles/articles.api.routes"));
const content_api_routes_1 = __importDefault(require("../modules/content/content.api.routes"));
const router = (0, express_1.Router)();
router.use('/articles', articles_api_routes_1.default);
router.use('/content', content_api_routes_1.default);
exports.default = router;
//# sourceMappingURL=api.js.map