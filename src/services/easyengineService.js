'use strict';

/**
 * Thin wrapper around EasyEngine's CLI. Every method validates input and
 * delegates to the hardened command runner.
 *
 * The EE CLI surface used here:
 *   ee site list  --format=json
 *   ee site info  <domain> --format=json
 *   ee site create <domain> --type=wp [--ssl=le] [--admin-user=...] [--admin-pass=...] [--admin-email=...]
 *   ee site delete <domain> --yes
 */

const { runEE: run, runEEOrThrow: runOrThrow } = require('./eeBridge');
const v = require('../utils/validators');

function tryParseJson(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

/**
 * Parse the ASCII table that `ee site info <domain>` prints when --format=json
 * isn't available, e.g.
 *
 *   +--------------------+-----------------------------------------+
 *   | Site               | https://snoopy.zuluha.com               |
 *   | WordPress Username | admin                                   |
 *   | DB Host            | global-db                               |
 *   ...
 *   +--------------------+-----------------------------------------+
 *
 * Returns a flat { key: value } map. Lines that aren't `| key | value |`
 * pairs are ignored.
 */
function parseEeInfoTable(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const parts = line.split('|').map((s) => s.trim());
    // ['', key, value, '']
    if (parts.length !== 4) continue;
    const k = parts[1];
    const v = parts[2];
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Parse plain-text `ee site list` output as a fallback when --format=json
 * isn't supported by the installed EE version.
 */
function parsePlainList(stdout) {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((l) => /^[a-z0-9.\-]+\.[a-z]{2,}/i.test(l))
    .map((l) => {
      const parts = l.split(/\s+/);
      return { site: parts[0], status: parts[1] || 'unknown' };
    });
}

async function listSites() {
  const r = await run(['site', 'list', '--format=json'], { category: 'easyengine' });
  if (r.code === 0) {
    const json = tryParseJson(r.stdout);
    if (Array.isArray(json)) return json;
  }
  // Fallback for older EE
  const r2 = await run(['site', 'list'], { category: 'easyengine' });
  if (r2.code !== 0) {
    return [];
  }
  return parsePlainList(r2.stdout);
}

/**
 * Always returns { raw, table, json }:
 *   - raw   : original CLI output (string)
 *   - table : flat key/value map parsed from the ASCII table
 *   - json  : structured object if EE returned --format=json (else null)
 */
async function siteInfo(domain) {
  v.assertDomain(domain);

  // Try the JSON path first
  const r = await run(['site', 'info', domain, '--format=json'], { category: 'easyengine' });
  if (r.code === 0) {
    const json = tryParseJson(r.stdout);
    if (json) return { raw: r.stdout, table: {}, json };
  }

  // Fall back to the ASCII table format
  const r2 = await runOrThrow(['site', 'info', domain], { category: 'easyengine' });
  return {
    raw: r2.stdout,
    table: parseEeInfoTable(r2.stdout),
    json: null
  };
}

async function createSite(domain, options = {}) {
  v.assertDomain(domain);

  const args = ['site', 'create', domain, `--type=${options.type || 'wp'}`];

  if (options.cache !== false) args.push('--cache');         // redis page cache by default
  if (options.ssl) args.push('--ssl=le');
  if (options.title) {
    if (typeof options.title !== 'string' || options.title.length > 200) {
      throw new Error('invalid title');
    }
    args.push(`--title=${options.title}`);
  }
  if (options.adminUser) {
    if (!v.isValidUsername(options.adminUser)) throw new Error('invalid admin user');
    args.push(`--admin-user=${options.adminUser}`);
  }
  if (options.adminPass) {
    if (!v.isStrongPassword(options.adminPass)) throw new Error('invalid admin password');
    args.push(`--admin-pass=${options.adminPass}`);
  }
  if (options.adminEmail) {
    if (!v.isValidEmail(options.adminEmail)) throw new Error('invalid admin email');
    args.push(`--admin-email=${options.adminEmail}`);
  }

  // EE site create can take many minutes when pulling images the first time.
  return runOrThrow(args, { category: 'easyengine', timeoutMs: 30 * 60 * 1000 });
}

async function deleteSite(domain) {
  v.assertDomain(domain);
  return runOrThrow(['site', 'delete', domain, '--yes'], {
    category: 'easyengine',
    timeoutMs: 10 * 60 * 1000
  });
}

module.exports = { listSites, siteInfo, createSite, deleteSite, parseEeInfoTable };
