import fs from 'fs';
import path from 'path';
import config from '../../config';
import * as llm from '../../services/llm';
import * as cse from '../../services/cse';
import { WordPressClient } from '../../services/wpClient';
import * as images from '../../services/imagesPipeline';
import * as repo from './articles.repository';
import * as siteRepo from '../sites/site.repository';
import * as logRepo from '../logs/log.repository';
import type { Article } from '../../types';

const PROMPTS_DIR = path.join(__dirname, 'prompts');
function loadPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8');
}

const PROMPT: Record<string, string> = {
  keywords:            loadPrompt('keyword_generation.txt'),
  title:               loadPrompt('title.txt'),
  research:            loadPrompt('research.txt'),
  outlineWithResearch: loadPrompt('outline_with_research.txt'),
  outlineNoResearch:   loadPrompt('outline_no_research.txt'),
  section:             loadPrompt('section.txt'),
  imageTranslate:      loadPrompt('image_translate.txt'),
  metadata:            loadPrompt('metadata.txt'),
};

function render(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{{${key}}}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Module 1: Keyword Generator ───────────────────────────────────────────────

export async function generateKeywords(
  topic: string,
  count: number,
  opts: {
    siteId?: number | null;
    language?: string;
    tone?: string;
    userId?: number | null;
  } = {}
): Promise<{ created: number; articles: Array<Article | null> }> {
  count = Math.max(1, Math.min(50, count || 5));

  const site = opts.siteId ? await siteRepo.findById(opts.siteId) : null;
  const language = opts.language || 'English';
  const tone     = opts.tone || (site?.default_tone as string | undefined) || config.articles.defaultTone;

  // Prepend language instruction so the prompt works for any language, even when the
  // base prompt template is written in Vietnamese.
  const langPrefix = language !== 'Vietnamese'
    ? `IMPORTANT: Generate all keywords in ${language}. Output ONLY the keywords in ${language} language.\n\n`
    : '';
  const prompt = langPrefix + render(PROMPT['keywords']!, { TOPIC: topic, COUNT: count, LANGUAGE: language });
  const text   = await llm.generate(prompt) as string;

  const keywords = text.split('|').map((k) => k.trim()).filter(Boolean);
  const created: Array<Article | null> = [];

  for (const keyword of keywords.slice(0, count)) {
    const art = await repo.createArticle({
      site_id:      opts.siteId ?? null,
      user_id:      opts.userId ?? null,
      keyword,
      outline_count: config.articles.defaultOutlineCount,
      tone,
      language,
    });
    created.push(art);
  }

  await logRepo.write({
    level: 'info', category: 'articles',
    message: `Generated ${created.length} keywords for topic "${topic}"${site ? ` on site ${site.domain}` : ''}`,
    userId: opts.userId ?? null,
  });

  return { created: created.length, articles: created };
}

// ── Module 2: Article Builder ─────────────────────────────────────────────────

export async function buildArticle(
  articleId: number, publishMode?: string, scheduledAt?: string | null
): Promise<{ ok: boolean; message: string }> {
  const claimed = await repo.claimArticleForBuild(articleId);
  if (!claimed) throw Object.assign(new Error('Article is not PENDING or already claimed'), { status: 409 });
  await repo.updateArticle(articleId, {
    publish_mode: publishMode ?? 'immediate',
    scheduled_at: scheduledAt ?? null,
  } as Parameters<typeof repo.updateArticle>[1]);

  _buildPipeline(articleId).catch(() => {});
  return { ok: true, message: 'Build started' };
}

async function _buildPipeline(articleId: number): Promise<void> {
  let article = await repo.findArticle(articleId);
  if (!article) return;

  const site     = article.site_id ? await siteRepo.findById(article.site_id as number) : null;
  const wp       = site ? new WordPressClient(site) : null;
  const language = (article.language as string | undefined) || 'English';
  const tone     = (article.tone as string | undefined) || (site?.default_tone as string | undefined) || config.articles.defaultTone;

  // Wrap generate() to prepend a language instruction when the template is Vietnamese
  function gen(prompt: string, opts?: Parameters<typeof llm.generate>[1]): Promise<unknown> {
    const prefix = language !== 'Vietnamese'
      ? `You must write ALL output in ${language} language only. Do not use Vietnamese.\n\n`
      : '';
    return llm.generate(prefix + prompt, opts);
  }

  async function step(name: string): Promise<void> {
    await repo.updateBuildStep(articleId, name);
  }

  async function fail(msg: string): Promise<void> {
    await repo.updateBuildStep(articleId, 'failed');
    await repo.updateArticle(articleId, {
      status: 'FAILED' as Article['status'],
      error_message: String(msg).slice(0, 2000),
      retry_count: ((article?.retry_count as number | undefined) ?? 0) + 1,
    });
    await logRepo.write({ level: 'error', category: 'articles',
      message: `Article #${articleId} build failed: ${msg}` });
  }

  async function save(fields: Parameters<typeof repo.updateArticle>[1]): Promise<void> {
    const updated = await repo.updateArticle(articleId, fields);
    if (updated) article = updated;
  }

  try {
    // Step 1: Title
    if (!article.title) {
      await step('title');
      const raw = await gen(render(PROMPT['title']!, { KEYWORD: article.keyword, LANGUAGE: language })) as string;
      await save({ title: String(raw).trim().slice(0, 60) });
    }

    // Step 2: Outline (with optional research)
    if (!article.outline) {
      let outlineText: string;
      if (article.content_html) {
        await step('outline');
        outlineText = await gen(render(PROMPT['outlineNoResearch']!, {
          KEYWORD: article.keyword, OUTLINE_COUNT: article.outline_count,
          LANGUAGE: language, TONE: tone,
        })) as string;
      } else {
        await step('research');
        const results = await cse.webSearch(article.keyword as string, 6);
        const links   = results.map((r) => r.link).join('\n');
        const researchText = links
          ? await gen(render(PROMPT['research']!, {
              KEYWORD: article.keyword, COMBINED_LINKS: links, LANGUAGE: language,
            })) as string
          : null;
        await step('outline');
        outlineText = researchText
          ? await gen(render(PROMPT['outlineWithResearch']!, {
              KEYWORD: article.keyword, OUTLINE_COUNT: article.outline_count,
              RESEARCH_TEXT: researchText, LANGUAGE: language, TONE: tone,
            })) as string
          : await gen(render(PROMPT['outlineNoResearch']!, {
              KEYWORD: article.keyword, OUTLINE_COUNT: article.outline_count,
              LANGUAGE: language, TONE: tone,
            })) as string;
      }
      await save({ outline: outlineText.trim() });
    }

    article = await repo.findArticle(articleId) ?? article;
    const sections = (article.outline as string)
      .split('\n').map((s) => s.trim()).filter(Boolean);

    const needSections = !article.content_html || !(article.content_html as string).includes('<h2>');
    let paragraphs: string[] = [];

    // Step 3: Sections
    if (needSections) {
      const fullOutline  = sections.join('\n');
      const contactInfo  = (site?.contact_info as string | undefined) ?? '';
      const CHUNK = 3;
      for (let i = 0; i < sections.length; i += CHUNK) {
        await step(`sections:${i + 1}-${Math.min(i + CHUNK, sections.length)}/${sections.length}`);
        const chunk = sections.slice(i, i + CHUNK);
        const results = await Promise.all(chunk.map((outline) =>
          gen(render(PROMPT['section']!, {
            OUTLINE: outline, FULL_OUTLINE: fullOutline,
            KEYWORD: article!.keyword, TONE: tone, LANGUAGE: language,
            CONTACT_INFO: contactInfo,
          })) as Promise<string>
        ));
        paragraphs = paragraphs.concat(results);
      }
    } else {
      paragraphs = [article.content_html as string];
    }

    const existingImages = await repo.listImagesForArticle(articleId);
    let imageUrls: Array<string | null> = existingImages.map((img) => img.wp_media_url ?? null);
    const imageSource  = (site?.image_source as string | undefined) ?? 'google';
    const imagesNeeded = needSections ? sections.length : 0;

    // Step 4: Images — fetch from Serper and embed directly (no WP upload)
    async function acquireImages(): Promise<void> {
      if (imageSource === 'none' || imagesNeeded === 0) return;
      if (existingImages.length >= imagesNeeded) return;

      await step('images');

      // Translate keyword to English for better Serper results
      let englishKeyword = article!.keyword as string;
      try {
        const translated = String(await llm.generate(
          render(PROMPT['imageTranslate']!, { KEYWORD: article!.keyword })
        )).trim();
        if (translated) {
          englishKeyword = translated;
          await logRepo.write({ level: 'info', category: 'cse',
            message: 'IMAGE.KEYWORD_TRANSLATE original="' + article!.keyword + '" english="' + englishKeyword + '"' });
        }
      } catch { /**/ }

      // Request 2x sections so filter losses still leave enough images
      const countRequest = Math.min(imagesNeeded * 2, 20);
      await logRepo.write({ level: 'info', category: 'cse',
        message: 'IMAGE.SEARCH query="' + englishKeyword + '" count_requested=' + countRequest });

      const candidates = await cse.imageSearch(englishKeyword, countRequest);

      await logRepo.write({ level: 'info', category: 'cse',
        message: 'IMAGE.SEARCH count_returned=' + candidates.length });

      const validated = await images.validateImages(candidates);
      if (!validated.length) return;

      await repo.clearImagesForArticle(articleId);
      imageUrls = [];

      for (let idx = 0; idx < validated.length && idx < imagesNeeded; idx++) {
        const img = validated[idx]!;
        const isFeatured = idx === 0;
        await repo.insertImage({
          article_id:   articleId,
          position:     idx,
          source_url:   img.url,
          wp_media_id:  null,
          wp_media_url: img.url,  // use direct URL — no WP upload
          is_featured:  isFeatured,
        });
        imageUrls.push(img.url);
      }
    }

    // Step 5: Metadata
    async function generateMetadata(): Promise<void> {
      if (article!.meta_description && article!.main_keyword && article!.tags) return;
      await step('metadata');
      const firstPara = paragraphs[0] ?? '';
      const metaSchema = {
        type: 'object',
        properties: {
          mainKeyword:     { type: 'string' },
          metaDescription: { type: 'string' },
          tags:            { type: 'array', items: { type: 'string' } },
        },
        required: ['mainKeyword', 'metaDescription', 'tags'],
      };
      const meta = await gen(render(PROMPT['metadata']!, {
        KEYWORD: article!.keyword, TITLE: article!.title ?? article!.keyword,
        FIRST_PARAGRAPH: firstPara.slice(0, 500), LANGUAGE: language,
      }), { json: true, jsonSchema: metaSchema }) as { mainKeyword: string; metaDescription: string; tags: string[] };

      let desc = String(meta.metaDescription ?? '').trim();
      if (desc.length > 160) desc = desc.slice(0, 160).replace(/\s\S+$/, '');

      await save({
        main_keyword:     meta.mainKeyword ?? article!.keyword,
        meta_description: desc,
        tags:             Array.isArray(meta.tags) ? meta.tags.slice(0, 5) : [],
      });
    }

    await Promise.all([acquireImages(), generateMetadata()]);
    article = await repo.findArticle(articleId) ?? article;

    if (needSections) {
      await step('stitching');
      const kw = (article!.keyword as string) || '';
      const finalImageData = (await repo.listImagesForArticle(articleId))
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map((img) => img.wp_media_url ? { url: img.wp_media_url as string, alt: kw } : null);

      const html = stitchHtml(paragraphs, finalImageData);
      if (!html.includes('<h2>') || html.length < 1000) {
        await fail(`Content too short or missing <h2> sections (length: ${html.length})`);
        return;
      }
      await save({ content_html: html });
    }

    await repo.updateBuildStep(articleId, null);
    await save({ status: 'READY', error_message: null });
    article = await repo.findArticle(articleId) ?? article;

    if (site && article.publish_mode === 'immediate') {
      await publishArticle(articleId);
    } else if (site) {
      await repo.updateArticle(articleId, { status: 'QUEUED' as Article['status'] });
    }
  } catch (err) {
    await fail((err as Error).message ?? String(err));
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export function stitchHtml(
  paragraphs: string[],
  imageData: Array<{ url: string; alt: string } | null>,
): string {
  let html = '';
  for (let i = 0; i < paragraphs.length; i++) {
    const cleaned = llm.stripFences(paragraphs[i] ?? '');
    html += '<div class="content-section">';
    const blocks = cleaned.split(/\n\n+/).map((b) => '<p>' + b + '</p>').join('');
    html += blocks + '</div>';
    const img = imageData?.[i];
    if (img?.url) {
      const a = escHtml(img.alt || '');
      html += '<div class="image-section"><img src="' + img.url + '" alt="' + a + '" title="' + a + '"></div>';
    }
  }
  return html;
}

// ── Module 3: Publisher ───────────────────────────────────────────────

export interface PublishOpts {
  /** Override site to publish to (defaults to article.site_id) */
  siteId?:     number | null;
  /** Override category (defaults to article.category_id) */
  categoryId?: number | null;
}

export async function publishArticle(articleId: number, opts: PublishOpts = {}): Promise<void> {
  const article = await repo.findArticle(articleId);
  if (!article) throw new Error('Article not found: ' + articleId);

  // Resolve site — opts.siteId overrides article.site_id
  const targetSiteId = (opts.siteId !== null ? opts.siteId : article.site_id) as number | null;
  if (!targetSiteId) throw Object.assign(
    new Error('No site assigned — please select a publish site first'), { status: 409 });

  const site = await siteRepo.findById(targetSiteId);
  if (!site) throw new Error('Site not found: ' + targetSiteId);

  // Resolve category — opts.categoryId overrides article.category_id
  const targetCategoryId = opts.categoryId !== null ? opts.categoryId : (article.category_id as number | null);

  const isFirstPublish = !article.wp_post_id;

  // Create a publish-history row right away (status=PUBLISHING)
  const pubRow = await repo.insertPublish({
    article_id:  articleId,
    site_id:     targetSiteId,
    site_domain: site.domain as string,
    category_id: targetCategoryId ?? null,
  });

  // Only flip the article-level status on first publish
  if (isFirstPublish) {
    await repo.updateArticle(articleId, { status: 'PUBLISHING' as Article['status'], error_message: null });
  }

  const wp = new WordPressClient(site);
  let payload: Record<string, unknown> = {};

  try {
    const tagNames: string[] = Array.isArray(article.tags)
      ? (article.tags as string[])
      : (article.tags ? JSON.parse(article.tags as string) : []);

    const tagIds: number[] = [];
    for (const name of tagNames) {
      try { tagIds.push(await wp.findOrCreateTag(name)); } catch { /**/ }
    }

    const isScheduled = isFirstPublish &&
                        article.publish_mode === 'scheduled' &&
                        article.scheduled_at &&
                        new Date(article.scheduled_at as string) > new Date();

    payload = {
      title:   article.title ?? article.keyword,
      content: article.content_html ?? '',
      status:  isScheduled ? 'future' : ((site.default_status as string | undefined) ?? 'publish'),
    };
    if (isScheduled) payload['date_gmt'] = new Date(article.scheduled_at as string).toISOString().replace(/\.\d{3}Z$/, '');
    if (tagIds.length)          payload['tags']       = tagIds;
    if (targetCategoryId)       payload['categories'] = [targetCategoryId];
    if (article.featured_media_id) payload['featured_media'] = article.featured_media_id;
    if (article.main_keyword || article.meta_description) {
      payload['meta'] = {};
      if (article.main_keyword)     (payload['meta'] as Record<string, unknown>)['_yoast_wpseo_focuskw']  = article.main_keyword;
      if (article.meta_description) (payload['meta'] as Record<string, unknown>)['_yoast_wpseo_metadesc'] = article.meta_description;
    }

    const post = await wp.createPost(payload);
    if (!post?.id) throw new Error('WP returned no post id');

    // Update publish-history row -> DONE
    if (pubRow?.id) {
      await repo.updatePublish(pubRow.id, {
        status:       'DONE',
        wp_post_id:   post.id,
        wp_post_link: post.link ?? null,
      });
    }

    // Only update main article record on first publish
    if (isFirstPublish) {
      await repo.updateArticle(articleId, {
        status:        'DONE' as Article['status'],
        wp_post_id:    post.id,
        wp_post_link:  post.link ?? null,
        error_message: null,
      });
    }

    await logRepo.write({ level: 'info', category: 'articles',
      message: `Article #${articleId} published to ${site.domain}: ${post.link ?? post.id}` });

  } catch (err) {
    const errMsg = String((err as Error).message ?? err);

    // Retry without Yoast meta if that was the cause
    if (errMsg.includes('meta') && payload['meta']) {
      delete payload['meta'];
      try {
        const post = await wp.createPost(payload);
        if (pubRow?.id) {
          await repo.updatePublish(pubRow.id, {
            status: 'DONE', wp_post_id: post.id, wp_post_link: post.link ?? null,
          });
        }
        if (isFirstPublish) {
          await repo.updateArticle(articleId, {
            status: 'DONE' as Article['status'],
            wp_post_id: post.id, wp_post_link: post.link ?? null,
          });
        }
        await logRepo.write({ level: 'warn', category: 'articles',
          message: `Article #${articleId} published to ${site.domain} without Yoast meta` });
        return;
      } catch { /**/ }
    }

    // Mark publish-history row -> FAILED
    if (pubRow?.id) {
      await repo.updatePublish(pubRow.id, { status: 'FAILED', error_message: errMsg.slice(0, 2000) });
    }

    // Only mark main article FAILED on first publish
    if (isFirstPublish) {
      await repo.updateArticle(articleId, {
        status:        'FAILED' as Article['status'],
        error_message: errMsg.slice(0, 2000),
        retry_count:   ((article.retry_count as number | undefined) ?? 0) + 1,
      });
    }

    await logRepo.write({ level: 'error', category: 'articles',
      message: `Article #${articleId} publish to ${site.domain} failed: ${errMsg}` });

    throw Object.assign(new Error(errMsg), { status: 502 });
  }
}

export async function retryArticle(articleId: number): Promise<{ ok: boolean }> {
  const article = await repo.findArticle(articleId);
  if (!article) throw Object.assign(new Error('Article not found'), { status: 404 });
  if (article.status !== 'FAILED') throw Object.assign(new Error('Only FAILED articles can be retried'), { status: 409 });
  await repo.updateArticle(articleId, { status: 'PENDING' as Article['status'], error_message: null });
  const claimed = await repo.claimArticleForBuild(articleId);
  if (!claimed) throw new Error('Failed to claim article for retry');
  _buildPipeline(articleId).catch(() => {});
  return { ok: true };
}
