"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.siteCategories = exports.update = exports.publish = exports.retry = exports.build = exports.generateKeywords = exports.status = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const service = __importStar(require("./articles.service"));
const repo = __importStar(require("./articles.repository"));
const siteRepo = __importStar(require("../sites/site.repository"));
const wpClient_1 = require("../../services/wpClient");
/** GET /api/articles/:id/status -- poll build status */
exports.status = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const article = await repo.findArticle(id);
    if (!article)
        return res.status(404).json({ error: 'not found' });
    res.json({ article });
});
/** POST /api/articles/keywords -- generate keyword articles from a topic */
exports.generateKeywords = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { site_id, topic, count } = req.body;
    if (!site_id || !topic) {
        return res.status(400).json({ error: 'site_id and topic are required' });
    }
    try {
        const result = await service.generateKeywords(parseInt(site_id, 10), String(topic).trim(), parseInt(count, 10) || 5, req.session.user?.id ?? null);
        res.json(result);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
});
/** POST /api/articles/:id/build -- trigger build pipeline */
exports.build = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const { publish_mode, scheduled_at } = req.body;
    try {
        const result = await service.buildArticle(id, publish_mode ?? 'immediate', scheduled_at ?? null);
        res.json(result);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
});
/** POST /api/articles/:id/retry -- retry a FAILED article */
exports.retry = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    try {
        const result = await service.retryArticle(id);
        res.json(result);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
});
/** POST /api/articles/:id/publish -- manually publish a READY article */
exports.publish = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    try {
        await service.publishArticle(id);
        res.json({ ok: true });
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
});
/** POST /api/articles/:id/update -- update article fields */
exports.update = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const allowed = ['category_id', 'scheduled_at', 'publish_mode', 'tone', 'outline_count'];
    const fields = {};
    const body = req.body;
    for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
            fields[k] = body[k] ?? null;
        }
    }
    try {
        const updated = await repo.updateArticle(id, fields);
        res.json({ article: updated });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/** GET /api/articles/sites/:siteId/categories -- WP category list for dropdown */
exports.siteCategories = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = parseInt(req.params['siteId'], 10);
    try {
        const site = await siteRepo.findById(siteId);
        if (!site)
            return res.status(404).json({ error: 'Site not found', categories: [] });
        const wp = new wpClient_1.WordPressClient(site);
        const categories = await wp.listCategories();
        res.json({ categories });
    }
    catch (err) {
        res.status(500).json({ error: err.message, categories: [] });
    }
});
//# sourceMappingURL=articles.api.controller.js.map