import { runEE as run, runEEOrThrow as runOrThrow } from './eeBridge';
import * as v from '../utils/validators';

interface EESite {
  site?: string;
  domain?: string;
  url?: string;
  Site?: string;
  'site-url'?: string;
  site_type?: string;
  type?: string;
  ssl?: boolean | string;
  SSL?: boolean | string;
  https?: boolean | string;
  status?: string;
  Status?: string;
}

interface EEInfoResult {
  raw: string;
  table: Record<string, string>;
  json: unknown;
}

interface CreateSiteOptions {
  type?: string;
  cache?: boolean;
  ssl?: boolean;
  title?: string;
  adminUser?: string;
  adminPass?: string;
  adminEmail?: string;
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function parseEeInfoTable(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'string') return out;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length !== 4) continue;
    const k = parts[1];
    const val = parts[2];
    if (!k) continue;
    out[k] = val;
  }
  return out;
}

function parsePlainList(stdout: string): EESite[] {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((l) => /^[a-z0-9.\-]+\.[a-z]{2,}/i.test(l))
    .map((l) => {
      const parts = l.split(/\s+/);
      return { site: parts[0], status: parts[1] ?? 'unknown' } as EESite;
    });
}

export async function listSites(): Promise<EESite[]> {
  const r = await run(['site', 'list', '--format=json'], { category: 'easyengine' });
  if (r.code === 0) {
    const json = tryParseJson(r.stdout);
    if (Array.isArray(json)) return json as EESite[];
  }
  const r2 = await run(['site', 'list'], { category: 'easyengine' });
  if (r2.code !== 0) return [];
  return parsePlainList(r2.stdout);
}

export async function siteInfo(domain: string): Promise<EEInfoResult> {
  v.assertDomain(domain);
  const r = await run(['site', 'info', domain, '--format=json'], { category: 'easyengine' });
  if (r.code === 0) {
    const json = tryParseJson(r.stdout);
    if (json) return { raw: r.stdout, table: {}, json };
  }
  const r2 = await runOrThrow(['site', 'info', domain], { category: 'easyengine' });
  return { raw: r2.stdout, table: parseEeInfoTable(r2.stdout), json: null };
}

export async function createSite(domain: string, options: CreateSiteOptions = {}): Promise<import('./commandRunner').RunResult> {
  v.assertDomain(domain);
  const args = ['site', 'create', domain, `--type=${options.type ?? 'wp'}`];
  if (options.cache !== false) args.push('--cache');
  if (options.ssl) args.push('--ssl=le');
  if (options.title) {
    if (typeof options.title !== 'string' || options.title.length > 200) throw new Error('invalid title');
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
  return runOrThrow(args, { category: 'easyengine', timeoutMs: 30 * 60 * 1000 });
}

export async function deleteSite(domain: string): Promise<import('./commandRunner').RunResult> {
  v.assertDomain(domain);
  return runOrThrow(['site', 'delete', domain, '--yes'], {
    category: 'easyengine', timeoutMs: 10 * 60 * 1000,
  });
}

export { parseEeInfoTable };
