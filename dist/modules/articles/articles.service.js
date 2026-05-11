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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeywords = generateKeywords;
exports.buildArticle = buildArticle;
exports.stitchHtml = stitchHtml;
exports.publishArticle = publishArticle;
exports.retryArticle = retryArticle;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = __importDefault(require("../../config"));
const llm = __importStar(require("../../services/llm"));
const cse = __importStar(require("../../services/cse"));
const wpClient_1 = require("../../services/wpClient");
const images = __importStar(require("../../services/imagesPipeline"));
const repo = __importStar(require("./articles.repository"));
const siteRepo = __importStar(require("../sites/site.repository"));
const logRepo = __importStar(require("../logs/log.repository"));
const PROMPTS_DIR = path_1.default.join(__dirname, 'prompts');
function loadPrompt(name) {
    return fs_1.default.readFileSync(path_1.default.join(PROMPTS_DIR, name), 'utf8');
}
const PROMPT = {
    keywords: loadPrompt('keyword_generation.txt'),
    title: loadPrompt('title.txt'),
    research: loadPrompt('research.txt'),
    outlineWithResearch: loadPrompt('outline_with_research.txt'),
    outlineNoResearch: loadPrompt('outline_no_research.txt'),
    section: loadPrompt('section.txt'),
    imageTranslate: loadPrompt('image_translate.txt'),
    metadata: loadPrompt('metadata.txt'),
};
function render(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{{${key}}}`);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
// ── Module 1: Keyword Generator ───────────────────────────────────────────────
async function generateKeywords(siteId, topic, count, userId) {
    count = Math.max(1, Math.min(50, count || 5));
    const site = await siteRepo.findById(siteId);
    if (!site)
        throw Object.assign(new Error('Site not found'), { status: 404 });
    const prompt = render(PROMPT['keywords'], { TOPIC: topic, COUNT: count });
    const text = await llm.generate(prompt);
    const keywords = text.split('|').map((k) => k.trim()).filter(Boolean);
    const created = [];
    for (const keyword of keywords.slice(0, count)) {
        const art = await repo.createArticle({
            site_id: siteId,
            user_id: userId ?? null,
            keyword,
            outline_count: config_1.default.articles.defaultOutlineCount,
            tone: site.default_tone ?? config_1.default.articles.defaultTone,
        });
        created.push(art);
    }
    await logRepo.write({
        level: 'info', category: 'articles',
        message: `Generated ${created.length} keywords for topic "${topic}" on site ${site.domain}`,
        userId: userId ?? null,
    });
    return { created: created.length, articles: created };
}
// ── Module 2: Article Builder ─────────────────────────────────────────────────
async function buildArticle(articleId, publishMode, scheduledAt) {
    const claimed = await repo.claimArticleForBuild(articleId);
    if (!claimed)
        throw Object.assign(new Error('Article is not PENDING or already claimed'), { status: 409 });
    await repo.updateArticle(articleId, {
        publish_mode: publishMode ?? 'immediate',
        scheduled_at: scheduledAt ?? null,
    });
    _buildPipeline(articleId).catch(() => { });
    return { ok: true, message: 'Build started' };
}
async function _buildPipeline(articleId) {
    let article = await repo.findArticle(articleId);
    if (!article)
        return;
    const site = await siteRepo.findById(article.site_id);
    if (!site)
        return;
    const wp = new wpClient_1.WordPressClient(site);
    async function fail(msg) {
        await repo.updateArticle(articleId, {
            status: 'FAILED',
            error_message: String(msg).slice(0, 2000),
            retry_count: (article?.retry_count ?? 0) + 1,
        });
        await logRepo.write({ level: 'error', category: 'articles',
            message: `Article #${articleId} build failed: ${msg}` });
    }
    async function save(fields) {
        const updated = await repo.updateArticle(articleId, fields);
        if (updated)
            article = updated;
    }
    try {
        if (!article.title) {
            const raw = await llm.generate(render(PROMPT['title'], { KEYWORD: article.keyword }));
            await save({ title: String(raw).trim().slice(0, 60) });
        }
        if (!article.outline) {
            let outlineText;
            if (article.content_html) {
                outlineText = await llm.generate(render(PROMPT['outlineNoResearch'], {
                    KEYWORD: article.keyword, OUTLINE_COUNT: article.outline_count,
                }));
            }
            else {
                const results = await cse.webSearch(article.keyword, 6);
                const links = results.map((r) => r.link).join('\n');
                const researchText = links
                    ? await llm.generate(render(PROMPT['research'], {
                        KEYWORD: article.keyword, COMBINED_LINKS: links,
                    }))
                    : null;
                outlineText = researchText
                    ? await llm.generate(render(PROMPT['outlineWithResearch'], {
                        KEYWORD: article.keyword, OUTLINE_COUNT: article.outline_count, RESEARCH_TEXT: researchText,
                    }))
                    : await llm.generate(render(PROMPT['outlineNoResearch'], {
                        KEYWORD: article.keyword, OUTLINE_COUNT: article.outline_count,
                    }));
            }
            await save({ outline: outlineText.trim() });
        }
        article = await repo.findArticle(articleId) ?? article;
        const sections = article.outline
            .split('\n').map((s) => s.trim()).filter(Boolean);
        const needSections = !article.content_html || !article.content_html.includes('<h2>');
        let paragraphs = [];
        if (needSections) {
            const fullOutline = sections.join('\n');
            const contactInfo = site.contact_info ?? '';
            const CHUNK = 3;
            for (let i = 0; i < sections.length; i += CHUNK) {
                const chunk = sections.slice(i, i + CHUNK);
                const results = await Promise.all(chunk.map((outline) => llm.generate(render(PROMPT['section'], {
                    OUTLINE: outline, FULL_OUTLINE: fullOutline,
                    KEYWORD: article.keyword, TONE: article.tone ?? config_1.default.articles.defaultTone,
                    CONTACT_INFO: contactInfo,
                }))));
                paragraphs = paragraphs.concat(results);
            }
        }
        else {
            paragraphs = [article.content_html];
        }
        const existingImages = await repo.listImagesForArticle(articleId);
        let imageUrls = existingImages.map((img) => img.wp_media_url ?? null);
        const imageSource = site.image_source ?? 'google';
        const imagesNeeded = needSections ? sections.length : 0;
        async function acquireAndUploadImages() {
            if (imageSource === 'none' || imagesNeeded === 0)
                return;
            if (existingImages.length >= imagesNeeded)
                return;
            let englishKeyword = article.keyword;
            try {
                englishKeyword = String(await llm.generate(render(PROMPT['imageTranslate'], { KEYWORD: article.keyword }))).trim();
            }
            catch { /**/ }
            let candidates = [];
            if (imageSource === 'google')
                candidates = await cse.imageSearch(englishKeyword, imagesNeeded);
            const downloaded = await images.validateAndDownload(candidates);
            if (!downloaded.length)
                return;
            await repo.clearImagesForArticle(articleId);
            imageUrls = [];
            for (let idx = 0; idx < downloaded.length && idx < imagesNeeded; idx++) {
                const img = downloaded[idx];
                try {
                    const media = await wp.uploadMedia(img.bytes, img.filename, img.contentType);
                    const isFeatured = idx === 0;
                    await repo.insertImage({
                        article_id: articleId, position: idx,
                        source_url: img.url, wp_media_id: media.id,
                        wp_media_url: media.source_url, is_featured: isFeatured,
                    });
                    imageUrls.push(media.source_url);
                    if (isFeatured)
                        await save({ featured_media_id: media.id });
                }
                catch (imgErr) {
                    imageUrls.push(null);
                    await logRepo.write({ level: 'warn', category: 'articles',
                        message: `Image upload failed for article #${articleId}: ${imgErr.message}` });
                }
            }
        }
        async function generateMetadata() {
            if (article.meta_description && article.main_keyword && article.tags)
                return;
            const firstPara = paragraphs[0] ?? '';
            const metaSchema = {
                type: 'object',
                properties: {
                    mainKeyword: { type: 'string' },
                    metaDescription: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                },
                required: ['mainKeyword', 'metaDescription', 'tags'],
            };
            let meta = await llm.generate(render(PROMPT['metadata'], {
                KEYWORD: article.keyword, TITLE: article.title ?? article.keyword,
                FIRST_PARAGRAPH: firstPara.slice(0, 500),
            }), { json: true, jsonSchema: metaSchema });
            let desc = String(meta.metaDescription ?? '').trim();
            if (desc.length > 160)
                desc = desc.slice(0, 160).replace(/\s\S+$/, '');
            await save({
                main_keyword: meta.mainKeyword ?? article.keyword,
                meta_description: desc,
                tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 5) : [],
            });
        }
        await Promise.all([acquireAndUploadImages(), generateMetadata()]);
        article = await repo.findArticle(articleId) ?? article;
        if (needSections) {
            const finalImageUrls = (await repo.listImagesForArticle(articleId))
                .sort((a, b) => a.position - b.position)
                .map((img) => img.wp_media_url ?? null);
            const html = stitchHtml(paragraphs, finalImageUrls);
            if (!html.includes('<h2>') || html.length < 1000) {
                await fail(`Content too short or missing <h2> sections (length: ${html.length})`);
                return;
            }
            await save({ content_html: html });
        }
        await save({ status: 'READY', error_message: null });
        article = await repo.findArticle(articleId) ?? article;
        if (article.publish_mode === 'immediate') {
            await publishArticle(articleId);
        }
        else {
            await repo.updateArticle(articleId, { status: 'QUEUED' });
        }
    }
    catch (err) {
        await fail(err.message ?? String(err));
    }
}
function stitchHtml(paragraphs, imageUrls) {
    let html = '';
    for (let i = 0; i < paragraphs.length; i++) {
        const cleaned = llm.stripFences(paragraphs[i] ?? '');
        html += '<div class="content-section">';
        const blocks = cleaned.split(/\n\n+/).map((b) => '<p>' + b + '</p>').join('');
        html += blocks + '</div>';
        const url = imageUrls?.[i];
        if (url)
            html += `<div class="image-section"><img src="${url}" alt="" title=""></div>`;
    }
    return html;
}
// ── Module 3: Publisher ───────────────────────────────────────────────────────
async function publishArticle(articleId) {
    const article = await repo.findArticle(articleId);
    if (!article)
        throw new Error('Article not found: ' + articleId);
    if (article.wp_post_id) {
        await repo.updateArticle(articleId, { status: 'DONE' });
        return;
    }
    const site = await siteRepo.findById(article.site_id);
    if (!site)
        throw new Error('Site not found for article: ' + articleId);
    const wp = new wpClient_1.WordPressClient(site);
    await repo.updateArticle(articleId, { status: 'PUBLISHING', error_message: null });
    let payload = {};
    try {
        const tagNames = Array.isArray(article.tags)
            ? article.tags
            : (article.tags ? JSON.parse(article.tags) : []);
        const tagIds = [];
        for (const name of tagNames) {
            try {
                tagIds.push(await wp.findOrCreateTag(name));
            }
            catch { /**/ }
        }
        const isScheduled = article.publish_mode === 'scheduled' &&
            article.scheduled_at &&
            new Date(article.scheduled_at) > new Date();
        payload = {
            title: article.title ?? article.keyword,
            content: article.content_html ?? '',
            status: isScheduled ? 'future' : (site.default_status ?? 'publish'),
        };
        if (isScheduled)
            payload['date_gmt'] = new Date(article.scheduled_at).toISOString().replace(/\.\d{3}Z$/, '');
        if (tagIds.length)
            payload['tags'] = tagIds;
        if (article.category_id)
            payload['categories'] = [article.category_id];
        if (article.featured_media_id)
            payload['featured_media'] = article.featured_media_id;
        if (article.main_keyword || article.meta_description) {
            payload['meta'] = {};
            if (article.main_keyword)
                payload['meta']['_yoast_wpseo_focuskw'] = article.main_keyword;
            if (article.meta_description)
                payload['meta']['_yoast_wpseo_metadesc'] = article.meta_description;
        }
        const post = await wp.createPost(payload);
        if (!post?.id)
            throw new Error('WP returned no post id');
        await repo.updateArticle(articleId, {
            status: 'DONE',
            wp_post_id: post.id,
            wp_post_link: post.link ?? null,
            error_message: null,
        });
        await logRepo.write({ level: 'info', category: 'articles',
            message: `Article #${articleId} "${article.title ?? article.keyword}" published: ${post.link ?? post.id}` });
    }
    catch (err) {
        const errMsg = String(err.message ?? err);
        if (errMsg.includes('meta') && payload['meta']) {
            delete payload['meta'];
            try {
                const post = await wp.createPost(payload);
                await repo.updateArticle(articleId, {
                    status: 'DONE',
                    wp_post_id: post.id, wp_post_link: post.link ?? null,
                });
                await logRepo.write({ level: 'warn', category: 'articles',
                    message: `Article #${articleId} published without Yoast meta` });
                return;
            }
            catch { /**/ }
        }
        await repo.updateArticle(articleId, {
            status: 'FAILED',
            error_message: errMsg.slice(0, 2000),
            retry_count: (article.retry_count ?? 0) + 1,
        });
        await logRepo.write({ level: 'error', category: 'articles',
            message: `Article #${articleId} publish failed: ${errMsg}` });
    }
}
async function retryArticle(articleId) {
    const article = await repo.findArticle(articleId);
    if (!article)
        throw Object.assign(new Error('Article not found'), { status: 404 });
    if (article.status !== 'FAILED')
        throw Object.assign(new Error('Only FAILED articles can be retried'), { status: 409 });
    await repo.updateArticle(articleId, { status: 'PENDING', error_message: null });
    const claimed = await repo.claimArticleForBuild(articleId);
    if (!claimed)
        throw new Error('Failed to claim article for retry');
    _buildPipeline(articleId).catch(() => { });
    return { ok: true };
}
//# sourceMappingURL=articles.service.js.map