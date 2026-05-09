'use strict';

/**
 * Image pipeline helpers.
 *
 * validateAndDownload(imageList) → filtered, downloaded image buffers
 *
 * imageList: [{ url, filename, contentType, title }]
 * Returns:   [{ url, filename, contentType, title, bytes }] (only valid ones)
 */

const axios = require('axios');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * HEAD-validate a single URL.
 * Returns true if status 200 and Content-Type is not text/html.
 */
async function headValidate(url) {
  try {
    const resp = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: function(s) { return s < 500; }
    });
    if (resp.status !== 200) return false;
    const ct = (resp.headers['content-type'] || '').toLowerCase();
    return !ct.startsWith('text/html');
  } catch (_) {
    return false;
  }
}

/**
 * Download raw bytes for a URL.
 * Returns Buffer or null on failure / oversize.
 */
async function downloadBytes(url) {
  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout:      30000,
      maxRedirects: 5,
      maxContentLength: MAX_FILE_SIZE
    });
    return Buffer.from(resp.data);
  } catch (_) {
    return null;
  }
}

/**
 * Filter, HEAD-validate, and download a list of image candidates.
 * Returns only those that pass validation + download successfully.
 */
async function validateAndDownload(imageList) {
  const results = [];
  for (const img of imageList) {
    const ok = await headValidate(img.url);
    if (!ok) continue;
    const bytes = await downloadBytes(img.url);
    if (!bytes || bytes.length === 0) continue;
    results.push(Object.assign({}, img, { bytes }));
  }
  return results;
}

module.exports = { validateAndDownload, headValidate, downloadBytes };
