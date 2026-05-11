import * as ee from '../../services/easyengineService';
import * as wp from '../../services/wordpressService';
import * as repo from './site.repository';
import * as v from '../../utils/validators';
import * as logRepo from '../logs/log.repository';
import { generate as generatePassword } from '../../utils/passwordGenerator';
import type { Site } from '../../types';

interface EESiteRaw {
  site?: string; domain?: string; url?: string; Site?: string; 'site-url'?: string;
  site_type?: string; type?: string;
  ssl?: boolean | string; SSL?: boolean | string; https?: boolean | string;
  status?: string; Status?: string;
}

export async function refreshFromEE(userId?: number | null): Promise<Site[]> {
  const list = await ee.listSites() as EESiteRaw[];
  for (const s of list) {
    const domain = s.site ?? s.domain ?? s.url ?? s.Site ?? s['site-url'];
    if (!domain) continue;
    await repo.upsert({
      domain: domain as string,
      site_type: (s.site_type ?? s.type ?? 'wp') as string,
      ssl:    !!(s.ssl || s.SSL || s.https),
      status: (s.status ?? s.Status ?? 'active') as string,
      created_by: userId ?? null,
    });
  }
  return repo.listAll();
}

export async function listLocal(): Promise<Site[]> {
  return repo.listAll();
}

export async function info(domain: string): Promise<{
  local: Site | null;
  eeInfo: { raw: string | null; table: Record<string, string>; json: unknown; error?: string };
  recentLogs: unknown[];
}> {
  v.assertDomain(domain);
  const local = await repo.findByDomain(domain);

  let eeInfo: { raw: string | null; table: Record<string, string>; json: unknown; error?: string } =
    { raw: null, table: {}, json: null };
  try { Object.assign(eeInfo, await ee.siteInfo(domain)); }
  catch (e) { eeInfo.error = (e as Error).message; }

  let recentLogs: unknown[] = [];
  try { recentLogs = await logRepo.searchByMessage(domain, 30); }
  catch { /**/ }

  return { local, eeInfo, recentLogs };
}

interface CreateFullParams {
  domain: string;
  title?: string;
  description?: string;
  ssl?: boolean;
  adminUser?: string;
  adminPass?: string;
  adminEmail?: string;
  category?: string;
  userId?: number | null;
}

export async function createFull(params: CreateFullParams): Promise<{
  site: Site | null;
  cfg: unknown;
  credentials: {
    url: string; adminUrl: string; user: string;
    password: string; email: string; passwordGenerated: boolean;
  };
}> {
  const { domain, ssl = false, category = 'Blog', userId } = params;
  v.assertDomain(domain);

  const finalAdminUser  = params.adminUser?.trim()  || 'admin';
  const finalAdminEmail = params.adminEmail?.trim() || ('admin@' + domain);
  const generatedPass   = !params.adminPass?.trim();
  const finalAdminPass  = generatedPass ? generatePassword(20) : params.adminPass!;
  const siteTitle       = params.title?.trim() || domain;

  await logRepo.write({ level: 'info', category: 'sites', message: 'creating site ' + domain, userId: userId ?? null });

  try {
    await ee.createSite(domain, {
      type: 'wp', cache: true, ssl,
      title: siteTitle, adminUser: finalAdminUser,
      adminPass: finalAdminPass, adminEmail: finalAdminEmail,
    });
  } catch (err) {
    const txt = (err as Error).message ?? '';
    if (/rateLimited|too many certificates/i.test(txt)) {
      throw new Error("Let's Encrypt rate limit hit for \"" + domain + '\". Re-create WITHOUT SSL. Original: ' + txt);
    }
    throw err;
  }

  await repo.upsert({ domain, site_type: 'wp', ssl: !!ssl, status: 'configuring',
    title: siteTitle, description: params.description ?? null, created_by: userId ?? null });

  const cfg = await wp.configureNewSite(domain, {
    title: siteTitle, description: params.description ?? '', category,
  });

  await repo.upsert({ domain, status: 'active', title: siteTitle,
    description: params.description ?? null, created_by: userId ?? null,
    wp_user: finalAdminUser, wp_pass: finalAdminPass });

  await logRepo.write({ level: 'info', category: 'sites',
    message: 'site ' + domain + ' configured', meta: cfg as unknown as Record<string, unknown>, userId: userId ?? null });

  return {
    site: await repo.findByDomain(domain),
    cfg,
    credentials: {
      url:      (ssl ? 'https' : 'http') + '://' + domain,
      adminUrl: (ssl ? 'https' : 'http') + '://' + domain + '/wp-admin',
      user:     finalAdminUser,
      password: finalAdminPass,
      email:    finalAdminEmail,
      passwordGenerated: generatedPass,
    },
  };
}

export async function updateCredentials(
  domain: string, wp_user: string, wp_pass: string, direct_connect?: boolean
): Promise<Site | null> {
  v.assertDomain(domain);
  return repo.updateCredentials(domain, wp_user || null, wp_pass || null, direct_connect);
}

export async function remove(domain: string, userId?: number | null): Promise<boolean> {
  v.assertDomain(domain);
  await ee.deleteSite(domain);
  await repo.remove(domain);
  await logRepo.write({ level: 'info', category: 'sites',
    message: 'site ' + domain + ' deleted', userId: userId ?? null });
  return true;
}
