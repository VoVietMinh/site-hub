'use strict';

/**
 * Google Custom Search Engine (CSE) helper.
 *
 * webSearch(query, num)    → [{ link, title }, ...]   (web results)
 * imageSearch(query, count) → [{ url, title }, ...]   (image results, paginated)
 */

const axios  = require('axios');
const config = require('../config');

const BASE = 'https://www.googleapis.com/customsearch/v1';

// ---------------------------------------------------------------------------
// Web search — returns up to `num` results, YouTube filtered out
// ---------------------------------------------------------------------------
async function webSearch(query, num) {
  num = num || 6;
  if (!config.cse.apiKey || !config.cse.cx) return [];
  try {
    const resp = await axios.get(BASE, {
      params: { q: query, cx: config.cse.cx, num, key: config.cse.apiKey },
      timeout: 20000
    });
    const items = (resp.data && resp.data.items) || [];
    return items
      .filter(function(i) {
        return !i.link.includes('youtube.com') && !i.link.includes('youtu.be');
      })
      .slice(0, 3)
      .map(function(i) { return { link: i.link, title: i.title || '' }; });
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Image search — paginates until `count` valid images collected
// ---------------------------------------------------------------------------
async function imageSearch(query, count) {
  count = count || 9;
  if (!config.cse.apiKey || !config.cse.cx) return [];

  const isImage = function(u) {
    return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
  };

  const seen = new Set();
  const out  = [];
  const ts   = new Date().toISOString().replace(/[:.]/g, '-');
  let counter = 1;

  const maxPages = Math.ceil(count / 10) + 1;

  for (let page = 0; page < maxPages && out.length < count; page++) {
    const start = page * 10 + 1;
    try {
      const resp = await axios.get(BASE, {
        params: {
          searchType: 'image',
          imgSize:    'large',
          imgType:    'photo',
          fileType:   'jpg',
          safe:       'active',
          q:          query,
          cx:         config.cse.cx,
          num:        10,
          start:      start,
          key:        config.cse.apiKey
        },
        timeout: 20000
      });
      const items = (resp.data && resp.data.items) || [];
      if (!items.length) break;

      for (const img of items) {
        if (out.length >= count) break;
        const url = img.link;
        if (!url || !isImage(url)) continue;
        const fname = url.split('/').pop().split('?')[0];
        if (seen.has(fname)) continue;
        seen.add(fname);
        const ext = fname.split('.').pop().toLowerCase();
        const ct  = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
        out.push({
          url,
          filename:    'image-' + ts + '-' + counter + '.' + ext,
          contentType: ct,
          title:       (img.title || query)
        });
        counter++;
      }
    } catch (_) {
      break;
    }
  }

  return out;
}

module.exports = { webSearch, imageSearch };
