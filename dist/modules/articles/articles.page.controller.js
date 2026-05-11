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
exports.detail = exports.index = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const repo = __importStar(require("./articles.repository"));
const siteRepo = __importStar(require("../sites/site.repository"));
/** GET /articles -- list all articles with optional filters */
exports.index = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query['site_id'] ? parseInt(req.query['site_id'], 10) : null;
    const status = req.query['status'] || null;
    const page = Math.max(1, parseInt(req.query['page'], 10) || 1);
    const limit = 30;
    const offset = (page - 1) * limit;
    const articles = siteId
        ? await repo.listArticlesForSite(siteId, { status, limit, offset })
        : await repo.listAllArticles({ status, limit, offset });
    const sites = await siteRepo.listAll();
    res.render('articles/index', {
        title: 'Articles', articles, sites,
        filters: { site_id: siteId, status }, page, limit,
    });
});
/** GET /articles/:id -- article detail page */
exports.detail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const article = await repo.findArticle(id);
    if (!article)
        return res.status(404).render('errors/404', { title: 'Not Found' });
    const artImages = await repo.listImagesForArticle(id);
    const site = article.site_id ? await siteRepo.findById(article.site_id) : null;
    res.render('articles/detail', {
        title: article.title ?? article.keyword,
        article, artImages, site,
        filters: { site_id: req.query['site_id'] ?? null },
    });
});
//# sourceMappingURL=articles.page.controller.js.map