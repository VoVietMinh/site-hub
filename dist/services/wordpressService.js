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
exports.wp = wp;
exports.wpSoft = wpSoft;
exports.setSiteOptions = setSiteOptions;
exports.applyOptionMap = applyOptionMap;
exports.installTheme = installTheme;
exports.installPlugins = installPlugins;
exports.ensureCategory = ensureCategory;
exports.findPageBySlug = findPageBySlug;
exports.createOrUpdatePage = createOrUpdatePage;
exports.deleteMenuByName = deleteMenuByName;
exports.createMenu = createMenu;
exports.addItemToMenu = addItemToMenu;
exports.getFirstMenuLocation = getFirstMenuLocation;
exports.assignMenuToLocation = assignMenuToLocation;
exports.flushRewrite = flushRewrite;
exports.flushCache = flushCache;
exports.configureNewSite = configureNewSite;
const eeBridge_1 = require("./eeBridge");
const v = __importStar(require("../utils/validators"));
const siteTemplate = __importStar(require("./siteTemplate"));
function shellQuote(arg) {
    const s = String(arg);
    if (/^[A-Za-z0-9_./:=,\-]+$/.test(s))
        return s;
    return "'" + s.replace(/'/g, "'\\''") + "'";
}
function buildWpCommand(wpArgv) {
    return ['wp', ...wpArgv, '--allow-root'].map(shellQuote).join(' ');
}
async function wp(domain, wpArgv, opts = {}) {
    v.assertDomain(domain);
    if (!Array.isArray(wpArgv) || wpArgv.length === 0)
        throw new Error('wpArgv must be a non-empty array');
    const command = buildWpCommand(wpArgv);
    return (0, eeBridge_1.runEEOrThrow)(['shell', domain, '--command=' + command], {
        category: 'wp-cli', timeoutMs: opts.timeoutMs ?? 10 * 60 * 1000,
    });
}
async function wpSoft(domain, wpArgv, opts = {}) {
    v.assertDomain(domain);
    const command = buildWpCommand(wpArgv);
    return (0, eeBridge_1.runEE)(['shell', domain, '--command=' + command], {
        category: 'wp-cli', timeoutMs: opts.timeoutMs ?? 10 * 60 * 1000,
    });
}
async function safeOptionUpdate(domain, key, value) {
    const r = await wpSoft(domain, ['option', 'update', key, value]);
    if (r.code === 0)
        return r;
    if (/Could not update option/i.test(r.stderr))
        return r;
    const msg = (r.stderr || r.stdout || '').trim();
    throw Object.assign(new Error('wp option update ' + key + ' failed: ' + msg), { result: r });
}
async function setSiteOptions(domain, opts) {
    if (opts.title)
        await safeOptionUpdate(domain, 'blogname', opts.title);
    if (opts.description)
        await safeOptionUpdate(domain, 'blogdescription', opts.description);
}
async function applyOptionMap(domain, options) {
    for (const k of Object.keys(options)) {
        const val = options[k];
        if (val === null || val === undefined)
            continue;
        await safeOptionUpdate(domain, k, String(val));
    }
}
const isHarmlessInstallNoop = (stderr) => /already installed|destination folder already exists/i.test(stderr ?? '');
const isHarmlessActivateNoop = (stderr) => /already active/i.test(stderr ?? '');
async function installTheme(domain, slug, opts = {}) {
    const activate = opts.activate !== false;
    const inst = await wpSoft(domain, ['theme', 'install', slug]);
    if (inst.code !== 0 && !isHarmlessInstallNoop(inst.stderr)) {
        throw Object.assign(new Error('theme install ' + slug + ' failed: ' + (inst.stderr || inst.stdout).trim()), { result: inst });
    }
    if (activate) {
        const act = await wpSoft(domain, ['theme', 'activate', slug]);
        if (act.code !== 0 && !isHarmlessActivateNoop(act.stderr)) {
            throw Object.assign(new Error('theme activate ' + slug + ' failed: ' + (act.stderr || act.stdout).trim()), { result: act });
        }
    }
    return { installed: inst, activated: activate };
}
async function installPlugins(domain, slugs, opts = {}) {
    const activate = opts.activate !== false;
    if (!Array.isArray(slugs) || slugs.length === 0)
        return [];
    const results = [];
    for (const slug of slugs) {
        const inst = await wpSoft(domain, ['plugin', 'install', slug]);
        const installOk = inst.code === 0 || isHarmlessInstallNoop(inst.stderr);
        if (!installOk) {
            results.push({ slug, ok: false, error: (inst.stderr || inst.stdout).trim() });
            continue;
        }
        if (!activate) {
            results.push({ slug, ok: true });
            continue;
        }
        const act = await wpSoft(domain, ['plugin', 'activate', slug]);
        const activateOk = act.code === 0 || isHarmlessActivateNoop(act.stderr);
        results.push(activateOk ? { slug, ok: true } : { slug, ok: false, error: (act.stderr || act.stdout).trim() });
    }
    return results;
}
async function ensureCategory(domain, name) {
    const r = await wpSoft(domain, ['term', 'create', 'category', name, '--porcelain']);
    return r.stdout.trim();
}
async function findPageBySlug(domain, slug) {
    const r = await wp(domain, ['post', 'list', '--post_type=page', '--name=' + slug, '--field=ID']);
    const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length)
        return null;
    const id = parseInt(lines[lines.length - 1], 10);
    return Number.isFinite(id) ? id : null;
}
async function createOrUpdatePage(domain, page) {
    const existing = await findPageBySlug(domain, page.slug);
    if (existing) {
        await wp(domain, ['post', 'update', String(existing), '--post_title=' + page.title, '--post_content=' + page.content]);
        return existing;
    }
    const r = await wp(domain, ['post', 'create', '--post_type=page', '--post_status=publish',
        '--post_title=' + page.title, '--post_name=' + page.slug, '--post_content=' + page.content, '--porcelain']);
    return parseInt(r.stdout.trim(), 10);
}
async function deleteMenuByName(domain, name) {
    const r = await wpSoft(domain, ['menu', 'delete', name]);
    return r.code === 0;
}
async function createMenu(domain, name) {
    const r = await wp(domain, ['menu', 'create', name, '--porcelain']);
    return parseInt(r.stdout.trim(), 10);
}
async function addItemToMenu(domain, menuName, postId, menuTitle) {
    const args = ['menu', 'item', 'add-post', menuName, String(postId)];
    if (menuTitle)
        args.push('--title=' + menuTitle);
    return wp(domain, args);
}
async function getFirstMenuLocation(domain) {
    try {
        const r = await wp(domain, ['menu', 'location', 'list', '--format=csv']);
        const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2)
            return null;
        const firstCol = (lines[1].split(',')[0] ?? '').replace(/^"|"$/g, '').trim();
        return firstCol || null;
    }
    catch {
        return null;
    }
}
async function assignMenuToLocation(domain, menuName, location) {
    if (!location)
        return null;
    return wp(domain, ['menu', 'location', 'assign', menuName, location]);
}
async function flushRewrite(domain) {
    return wp(domain, ['rewrite', 'flush', '--hard']);
}
async function flushCache(domain) {
    return wp(domain, ['cache', 'flush']);
}
async function configureNewSite(domain, opts = {}) {
    const tpl = siteTemplate.load();
    const websiteName = opts.title || domain;
    const description = opts.description || '';
    const vars = { domain, websiteName, description };
    const warnings = [];
    await setSiteOptions(domain, { title: websiteName, description });
    await applyOptionMap(domain, tpl.options ?? {});
    await installTheme(domain, tpl.theme, { activate: true });
    const plugins = await installPlugins(domain, tpl.plugins ?? [], { activate: true });
    if (opts.category)
        await ensureCategory(domain, opts.category);
    const pageRecords = [];
    for (const page of (tpl.pages ?? [])) {
        const id = await createOrUpdatePage(domain, {
            slug: page.slug,
            title: siteTemplate.applyTemplate(page.title, vars),
            content: siteTemplate.applyTemplate(page.content, vars),
        });
        if (Number.isFinite(id)) {
            pageRecords.push({ id, slug: page.slug, menuTitle: siteTemplate.applyTemplate(page.menuTitle || page.title, vars) });
        }
    }
    const menuName = tpl.menuName || 'Main Menu';
    let menuId = null;
    let menuLocation = null;
    try {
        await deleteMenuByName(domain, menuName);
        menuId = await createMenu(domain, menuName);
        for (const p of pageRecords)
            await addItemToMenu(domain, menuName, p.id, p.menuTitle);
        menuLocation = await getFirstMenuLocation(domain);
        if (menuLocation) {
            await assignMenuToLocation(domain, menuName, menuLocation);
        }
        else {
            warnings.push('No menu location found in theme -- menu created but not assigned.');
        }
    }
    catch (menuErr) {
        warnings.push('Menu setup skipped: ' + menuErr.message);
    }
    await flushCache(domain).catch(() => { });
    await flushRewrite(domain);
    return { theme: tpl.theme, plugins, pages: pageRecords, menuName, menuId, menuLocation, warnings };
}
//# sourceMappingURL=wordpressService.js.map