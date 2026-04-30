'use strict';

const siteTemplate = require('../../services/siteTemplate');
const logRepo = require('../logs/log.repository');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Show the site-template settings page. The view is a structured form —
 * the JSON file on disk remains the source of truth, but operators never
 * have to look at it.
 */
exports.index = function index(req, res) {
  const tpl = siteTemplate.load();
  res.render('template/index', {
    title: res.__('siteTemplate.title'),
    tpl,
    filePath: siteTemplate.FILE
  });
};

/**
 * Apply form values back to the template.
 *
 * Form name shape (Express qs-style):
 *   theme         : string
 *   menuName      : string
 *   plugins[]     : string[]
 *   optionKeys[]  : string[]   (parallel)
 *   optionValues[]: string[]   (parallel — index-aligned with optionKeys)
 *   pages[N][slug|title|menuTitle|content]
 */
exports.update = asyncHandler(async (req, res) => {
  const b = req.body || {};

  const theme = String(b.theme || '').trim() || 'newspare';
  const menuName = String(b.menuName || '').trim() || 'Main Menu';

  const plugins = toArray(b.plugins)
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const optKeys = toArray(b.optionKeys);
  const optVals = toArray(b.optionValues);
  const options = {};
  for (let i = 0; i < optKeys.length; i++) {
    const k = String(optKeys[i] || '').trim();
    if (!k) continue;
    options[k] = String(optVals[i] || '');
  }

  // pages may parse as an object (with index keys) or an array depending on
  // how qs collapsed gaps — normalise to an array.
  const rawPages = b.pages || {};
  const pageList = Array.isArray(rawPages) ? rawPages : Object.values(rawPages);
  const pages = [];
  for (const p of pageList) {
    if (!p || typeof p !== 'object') continue;
    const slug = String(p.slug || '').trim();
    if (!slug) continue;
    const title = String(p.title || '').trim() || slug;
    pages.push({
      slug,
      title,
      menuTitle: String(p.menuTitle || '').trim() || title,
      content: String(p.content || '')
    });
  }

  const tpl = { theme, plugins, options, menuName, pages };
  siteTemplate.save(tpl);

  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: 'site template updated',
    userId: req.session.user.id
  });

  req.flash('success', res.__('users.updated'));
  res.redirect('/template');
});

/**
 * Coerce a form field that may arrive as a single string, an array, or
 * undefined into a flat string array. Keeps empty strings (caller filters).
 */
function toArray(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}
