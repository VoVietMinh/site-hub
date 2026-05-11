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
exports.dispatchN8n = exports.publishKeyword = exports.runKeyword = exports.runJob = exports.updateKeyword = exports.keywordDetail = exports.detail = exports.start = exports.showNew = exports.index = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const service = __importStar(require("./content.service"));
const repo = __importStar(require("./content.repository"));
const sitesRepo = __importStar(require("../sites/site.repository"));
exports.index = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const jobs = await repo.listJobs();
    res.render('content/index', { title: res.__('content.title'), jobs });
});
exports.showNew = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sites = await sitesRepo.listAll();
    res.render('content/new', { title: res.__('content.newJob'), sites, values: {} });
});
exports.start = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const b = req.body;
    const { topic, num_keywords, site_domain } = b;
    try {
        const job = await service.startJob({
            topic, numKeywords: parseInt(num_keywords, 10),
            siteDomain: site_domain ?? null, userId: req.session.user.id,
        });
        req.flash('success', res.__('content.jobCreated'));
        res.redirect('/content/' + job.id);
    }
    catch (err) {
        const e = err;
        req.flash('error', e.message);
        res.status(e.status ?? 500).render('content/new', {
            title: res.__('content.newJob'), sites: await sitesRepo.listAll(), values: req.body,
        });
    }
});
exports.detail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const job = await repo.findJob(id);
    if (!job)
        return res.status(404).render('errors/404', { title: 'Not Found' });
    const keywords = await repo.listKeywordsForJob(id);
    res.render('content/detail', { title: 'Job #' + id, job, keywords });
});
exports.keywordDetail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const jobId = parseInt(req.params['id'], 10);
    const kid = parseInt(req.params['kid'], 10);
    const job = await repo.findJob(jobId);
    const keyword = await repo.findKeyword(kid);
    if (!job || !keyword)
        return res.status(404).render('errors/404', { title: 'Not Found' });
    let site = null;
    if (job.site_id) {
        try {
            const raw = await sitesRepo.findById(job.site_id);
            if (raw)
                site = {
                    domain: raw.domain, ssl: !!raw.ssl,
                    wpUser: raw.wp_user,
                    hasCreds: !!(raw.wp_user && raw.wp_pass),
                };
        }
        catch { /**/ }
    }
    res.render('content/keyword', { title: keyword.keyword, job, keyword, site });
});
exports.updateKeyword = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['kid'], 10);
    const b = req.body;
    await service.configureKeyword(id, {
        tone: b['tone'], numOutlines: b['num_outlines'],
        category: b['category'], publishStatus: b['publish_status'],
        title: b['title'], content: b['content'],
    });
    req.flash('success', res.__('content.keywordUpdated'));
    if (b['_return'] === 'keyword') {
        res.redirect('/content/' + req.params['id'] + '/keywords/' + req.params['kid']);
    }
    else {
        res.redirect('/content/' + req.params['id']);
    }
});
exports.runJob = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const jobId = parseInt(req.params['id'], 10);
    service.runJob(jobId, {}).catch(() => { });
    req.flash('info', res.__('content.jobStarted'));
    res.redirect('/content/' + jobId);
});
exports.runKeyword = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const kid = parseInt(req.params['kid'], 10);
    service.runKeyword(kid, {}).catch(() => { });
    req.flash('info', res.__('content.keywordStarted'));
    res.redirect('/content/' + req.params['id']);
});
exports.publishKeyword = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const jobId = parseInt(req.params['id'], 10);
    const kid = parseInt(req.params['kid'], 10);
    try {
        await service.publishKeyword(kid);
        req.flash('success', 'Published successfully');
    }
    catch (err) {
        req.flash('error', err.message);
    }
    res.redirect('/content/' + jobId);
});
exports.dispatchN8n = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const jobId = parseInt(req.params['id'], 10);
    const result = await service.dispatchJobToN8n(jobId);
    if (result.skipped) {
        req.flash('error', res.__('content.n8nNotConfigured'));
    }
    else {
        req.flash('success', res.__('content.n8nDispatched'));
    }
    res.redirect('/content/' + jobId);
});
//# sourceMappingURL=content.page.controller.js.map