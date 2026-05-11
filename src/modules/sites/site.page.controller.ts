import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './site.service';
import * as v from '../../utils/validators';

export const index = asyncHandler(async (req: Request, res: Response) => {
  let sites: unknown[] = [];
  let refreshError: string | null = null;
  try {
    sites = await service.refreshFromEE(req.session.user!.id);
  } catch (e) {
    refreshError = (e as Error).message;
    sites = await service.listLocal();
  }
  const all = sites as Array<{ status?: string; ssl?: boolean }>;
  const stats = {
    total:       all.length,
    active:      all.filter((s) => s.status === 'active').length,
    configuring: all.filter((s) => s.status === 'configuring').length,
    ssl:         all.filter((s) => s.ssl).length,
  };
  res.render('sites/index', { title: res.__('sites.title'), sites, stats, refreshError });
});

export const showCreate = (req: Request, res: Response): void => {
  res.render('sites/create', { title: res.__('sites.create'), values: {} });
};

export const create = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body as Record<string, string>;
  const { domain, title, description, ssl, admin_user, admin_pass, admin_email, category } = b;
  if (!v.isValidDomain(domain)) {
    req.flash('error', res.__('sites.invalidDomain'));
    return res.status(400).render('sites/create', { title: res.__('sites.create'), values: req.body });
  }
  try {
    const result = await service.createFull({
      domain, title, description,
      ssl: ssl === 'on' || ssl === '1',
      adminUser: admin_user, adminPass: admin_pass, adminEmail: admin_email,
      category, userId: req.session.user!.id,
    });
    res.render('sites/created', {
      title: res.__('sites.created', { domain: (result.site as { domain: string }).domain }),
      site: result.site, cfg: result.cfg, credentials: result.credentials,
    });
  } catch (err) {
    req.flash('error', (err as Error).message);
    res.status(500).render('sites/create', { title: res.__('sites.create'), values: req.body });
  }
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const domain = req.params['domain']!;
  v.assertDomain(domain);
  const data = await service.info(domain);
  res.render('sites/detail', {
    title: domain, domain,
    local: data.local, eeInfo: data.eeInfo,
    table: (data.eeInfo as { table?: unknown } | null)?.table ?? {},
    recentLogs: (data as { recentLogs?: unknown[] }).recentLogs ?? [],
  });
});

export const updateCredentials = asyncHandler(async (req: Request, res: Response) => {
  const domain = req.params['domain']!;
  v.assertDomain(domain);
  const body = req.body as { wp_user?: string; wp_pass?: string; direct_connect?: string; _direct_only?: string };
  const { wp_user = '', wp_pass = '' } = body;
  // direct_connect checkbox sends '1' when checked, absent when unchecked
  const direct_connect = body.direct_connect === '1';
  await service.updateCredentials(domain, wp_user, wp_pass, direct_connect);
  req.flash('success', body._direct_only ? 'Connection settings updated' : 'WordPress API credentials saved');
  res.redirect('/sites/' + encodeURIComponent(domain));
});

export const destroy = asyncHandler(async (req: Request, res: Response) => {
  const domain = req.params['domain']!;
  await service.remove(domain, req.session.user!.id);
  req.flash('success', res.__('sites.deleted', { domain }));
  res.redirect('/sites');
});
