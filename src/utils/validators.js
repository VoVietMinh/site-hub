'use strict';

/**
 * Strict input validators. Used at the controller boundary so nothing unsafe
 * reaches the command runner.
 */

// RFC-1123 hostname / FQDN, no leading/trailing dots, max 253 chars.
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

function isValidDomain(d) {
  return typeof d === 'string' && DOMAIN_RE.test(d);
}

function assertDomain(d) {
  if (!isValidDomain(d)) {
    const err = new Error('invalid domain');
    err.status = 400;
    throw err;
  }
  return d;
}

function isNonEmptyString(s, max = 1000) {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= max;
}

function isPositiveInt(n, max = 1000) {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 && v <= max;
}

const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,32}$/;
function isValidUsername(u) {
  return typeof u === 'string' && USERNAME_RE.test(u);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(e) {
  return typeof e === 'string' && EMAIL_RE.test(e) && e.length <= 254;
}

function isStrongPassword(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 128;
}

module.exports = {
  isValidDomain,
  assertDomain,
  isNonEmptyString,
  isPositiveInt,
  isValidUsername,
  isValidEmail,
  isStrongPassword
};
