'use strict';

/**
 * Generate a URL/CLI-safe random password. Mirrors the bash script's
 * `openssl rand -base64 18` but stripped of `/`, `+`, `=` so the value
 * survives passing to ee-cli unquoted.
 */

const crypto = require('crypto');

function generate(length = 20) {
  // base64 of 18 bytes ~= 24 chars; we strip noisy chars and trim to length.
  const raw = crypto.randomBytes(24).toString('base64').replace(/[\/+=]/g, '');
  return raw.slice(0, length);
}

module.exports = { generate };
