import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as siteTemplate from '../../services/siteTemplate';
import type { SiteTemplate, SitePage } from '../../services/siteTemplate';
import * as logRepo from '../logs/log.repository';

export const index = (req: Request, res: Response): void => {
  const tpl = siteTemplate.load();
  res.render('template/index', {
    title:    res.__('siteTemplate.title'),
    tpl,
    filePath: siteTemplate.FILE,
  });
};

function toArray(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v as string[];
  return [v as string];
}

export const update = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const theme    = String(b['theme']    ?? '').trim() || 'newspare';
  const menuName = String(b['menuName'] ?? '').trim() || 'Main Menu';
  const plugins  = toArray(b['plugins']).map((s) => String(s ?? '').trim()).filter(Boolean);
  const optKeys  = toArray(b['optionKeys']);
  const optVals  = toArray(b['optionValues']);
  const options: Record<string, string> = {};
  for (let i = 0; i < optKeys.length; i++) {
    const k = String(optKeys[i] ?? '').trim();
    if (!k) continue;
    options[k] = String(optVals[i] ?? '');
  }

  const rawPages = b['pages'] ?? {};
  const pageList = Array.isArray(rawPages) ? rawPages : Object.values(rawPages as Record<string, unknown>);
  const pages: SitePage[] = [];
  for (const p of pageList) {
    if (!p || typeof p !== 'object') continue;
    const po = p as Record<string, unknown>;
    const slug = String(po['slug'] ?? '').trim();
    if (!slug) continue;
    const title = String(po['title'] ?? '').trim() || slug;
    pages.push({
      slug,
      title,
      menuTitle: String(po['menuTitle'] ?? '').trim() || title,
      content:   String(po['content'] ?? ''),
    });
  }

  const tpl: SiteTemplate = { theme, plugins, options, menuName, pages };
  siteTemplate.save(tpl);

  await logRepo.write({
    level: 'info', category: 'sites',
    message: 'site template updated',
    userId: req.session.user!.id,
  });

  req.flash('success', res.__('users.updated'));
  res.redirect('/template');
});
