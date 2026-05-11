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
exports.startJob = startJob;
exports.configureKeyword = configureKeyword;
exports.runKeyword = runKeyword;
exports.publishKeyword = publishKeyword;
exports.runJob = runJob;
exports.dispatchJobToN8n = dispatchJobToN8n;
exports.getJobStatus = getJobStatus;
exports.getJobCategories = getJobCategories;
exports.checkJobConnection = checkJobConnection;
const repo = __importStar(require("./content.repository"));
const sitesRepo = __importStar(require("../sites/site.repository"));
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- legacy JS service, no types
const cs = __importStar(require("../../services/contentService"));
const logRepo = __importStar(require("../logs/log.repository"));
const v = __importStar(require("../../utils/validators"));
async function getSiteForJob(job) {
    if (!job || !job.site_id)
        return null;
    return sitesRepo.findById(job.site_id);
}
async function getSiteToken(site) {
    if (!site.wp_user || !site.wp_pass) {
        throw new Error('WordPress API credentials not set for ' + site.domain +
            ' -- go to Sites > ' + site.domain + ' and save WP Admin credentials first.');
    }
    return cs.getWpToken(site.domain, !!site.ssl, site.wp_user, site.wp_pass);
}
async function startJob(params) {
    const { topic, numKeywords, siteDomain, userId } = params;
    if (!v.isNonEmptyString(topic, 200))
        throw Object.assign(new Error('invalid topic'), { status: 400 });
    if (!v.isPositiveInt(numKeywords, 100))
        throw Object.assign(new Error('invalid numKeywords (1-100)'), { status: 400 });
    let site = null;
    if (siteDomain) {
        v.assertDomain(siteDomain);
        site = await sitesRepo.findByDomain(siteDomain);
    }
    const job = await repo.createJob({
        site_id: site?.id ?? null, topic, num_keywords: numKeywords, created_by: userId,
    });
    if (!job)
        throw new Error('Failed to create job');
    const keywords = await cs.generateKeywords({ topic, count: numKeywords });
    for (const keyword of keywords) {
        await repo.addKeyword({ job_id: job.id, keyword });
    }
    await logRepo.write({ level: 'info', category: 'content',
        message: `job #${job.id} created with ${keywords.length} keywords for topic "${topic}"`, userId });
    return repo.findJob(job.id);
}
async function configureKeyword(id, opts) {
    const fields = {};
    if (opts.tone !== undefined)
        fields.tone = opts.tone;
    if (opts.numOutlines !== undefined)
        fields['num_outlines'] = parseInt(String(opts.numOutlines), 10);
    if (opts.category !== undefined)
        fields.category = opts.category;
    if (opts.publishStatus !== undefined)
        fields['publish_status'] = opts.publishStatus;
    if (opts.title !== undefined)
        fields.title = opts.title;
    if (opts.content !== undefined)
        fields.content = opts.content;
    return repo.updateKeyword(id, fields);
}
async function runKeyword(keywordId, _opts = {}) {
    const k = await repo.findKeyword(keywordId);
    if (!k)
        throw new Error('keyword not found');
    const job = await repo.findJob(k.job_id);
    const site = await getSiteForJob(job);
    await repo.updateKeyword(keywordId, { status: 'OUTLINE' });
    try {
        const outline = await cs.generateOutline({ keyword: k.keyword, numOutlines: k.num_outlines, tone: k.tone });
        await repo.updateKeyword(keywordId, { outline: JSON.stringify(outline), status: 'ARTICLE' });
        const article = await cs.generateArticle({ keyword: k.keyword, outline, tone: k.tone });
        await repo.updateKeyword(keywordId, { title: article.title, content: article.content, status: 'IMAGES' });
        const imgs = await cs.fetchImages({ keyword: k.keyword, count: 3 });
        await repo.updateKeyword(keywordId, { images_json: JSON.stringify(imgs), status: 'PUBLISHING' });
        if (site) {
            const token = await getSiteToken(site);
            const post = await cs.publishToWordPress({
                domain: site.domain, ssl: !!site.ssl, token,
                title: article.title, content: article.content,
                status: k.publish_status ?? 'publish', category: k.category ?? null,
            });
            await repo.updateKeyword(keywordId, { status: 'PUBLISHED', post_link: post.link ?? null, error_message: null });
            await logRepo.write({ level: 'info', category: 'content',
                message: `keyword #${k.id} "${k.keyword}" published: ${post.link}` });
        }
        else {
            await repo.updateKeyword(keywordId, {
                status: 'GENERATED',
                error_message: 'No site bound to this job -- content generated, ready to publish manually.',
            });
        }
        return repo.findKeyword(keywordId);
    }
    catch (err) {
        await repo.updateKeyword(keywordId, { status: 'ERROR', error_message: err.message });
        await logRepo.write({ level: 'error', category: 'content',
            message: `keyword #${k.id} failed: ${err.message}` });
        throw err;
    }
}
async function publishKeyword(keywordId) {
    const k = await repo.findKeyword(keywordId);
    if (!k)
        throw new Error('keyword not found');
    if (!k.content)
        throw new Error('no content generated yet -- run the keyword first');
    const job = await repo.findJob(k.job_id);
    const site = await getSiteForJob(job);
    if (!site)
        throw new Error('no site bound to this job -- cannot auto-publish');
    await repo.updateKeyword(keywordId, { status: 'PUBLISHING', error_message: null });
    try {
        const token = await getSiteToken(site);
        const post = await cs.publishToWordPress({
            domain: site.domain, ssl: !!site.ssl, token,
            title: (k.title ?? k.keyword), content: k.content,
            status: (k.publish_status ?? 'publish'), category: k.category,
        });
        await repo.updateKeyword(keywordId, { status: 'PUBLISHED', post_link: post.link ?? null, error_message: null });
        await logRepo.write({ level: 'info', category: 'content', message: `keyword #${k.id} manually published: ${post.link}` });
        return repo.findKeyword(keywordId);
    }
    catch (err) {
        await repo.updateKeyword(keywordId, { status: 'ERROR', error_message: err.message });
        throw err;
    }
}
async function runJob(jobId, opts) {
    const job = await repo.findJob(jobId);
    if (!job)
        throw new Error('job not found');
    await repo.setJobStatus(jobId, 'RUNNING');
    const keywords = await repo.listKeywordsForJob(jobId);
    for (const kw of keywords) {
        try {
            await runKeyword(kw.id, opts);
        }
        catch { /**/ }
    }
    await repo.setJobStatus(jobId, 'DONE');
    return repo.findJob(jobId);
}
async function dispatchJobToN8n(jobId) {
    const job = await repo.findJob(jobId);
    const keywords = await repo.listKeywordsForJob(jobId);
    return cs.dispatchToN8n({
        payload: {
            job_id: job?.id, topic: job?.topic,
            keywords: keywords.map((k) => ({
                id: k.id, keyword: k.keyword, tone: k.tone,
                num_outlines: k.num_outlines, category: k.category, publish_status: k.publish_status,
            })),
        },
    });
}
async function getJobStatus(jobId) {
    const job = await repo.findJob(jobId);
    if (!job)
        return null;
    return { job, keywords: await repo.listKeywordsForJob(jobId) };
}
async function getJobCategories(jobId) {
    const job = await repo.findJob(jobId);
    const site = await getSiteForJob(job);
    if (!site)
        return { categories: [], error: 'No WordPress site bound to this job.' };
    if (!site.wp_user || !site.wp_pass) {
        return { categories: [], error: 'No WordPress credentials saved for ' + site.domain + ' -- go to Sites and save them first.' };
    }
    try {
        const token = await getSiteToken(site);
        const categories = await cs.wpApiGetCategories(site.domain, !!site.ssl, token);
        return { categories: categories, error: null };
    }
    catch (err) {
        return { categories: [], error: err.message };
    }
}
async function checkJobConnection(jobId) {
    const job = await repo.findJob(jobId);
    const site = await getSiteForJob(job);
    if (!site)
        return { ok: false, domain: '', ssl: false, wpUser: null, hasCreds: false, siteInfo: null, categories: [], error: 'No WordPress site bound to this job.' };
    const result = {
        ok: false, domain: site.domain, ssl: !!site.ssl,
        wpUser: site.wp_user ?? null,
        hasCreds: !!(site.wp_user && site.wp_pass),
        siteInfo: null, categories: [], error: null,
    };
    if (!site.wp_user || !site.wp_pass) {
        result.error = 'WordPress API credentials not set -- go to Sites > ' + site.domain + ' and save them first.';
        return result;
    }
    try {
        const token = await getSiteToken(site);
        result.siteInfo = await cs.getWpSiteInfo(site.domain, !!site.ssl, token);
        result.categories = await cs.wpApiGetCategories(site.domain, !!site.ssl, token);
        result.ok = true;
    }
    catch (err) {
        result.error = err.message;
    }
    return result;
}
//# sourceMappingURL=content.service.js.map