import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './user.service';
import * as logRepo from '../logs/log.repository';

export const index = asyncHandler(async (req: Request, res: Response) => {
  const admins = await service.listAdmins();
  res.render('users/index', { title: res.__('users.title'), admins });
});

export const showCreate = (req: Request, res: Response): void => {
  res.render('users/create', { title: res.__('users.create'), values: {} });
};

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password } = req.body as { username: string; email: string; password: string };
  try {
    const u = await service.createAdmin({ username, email, password });
    await logRepo.write({ level: 'info', category: 'users',
      message: 'admin created: ' + u.username, userId: req.session.user!.id });
    req.flash('success', res.__('users.created'));
    res.redirect('/users');
  } catch (err) {
    const e = err as Error & { status?: number };
    req.flash('error', e.message);
    res.status(e.status ?? 400).render('users/create', {
      title: res.__('users.create'), values: { username, email },
    });
  }
});

export const toggleActive = asyncHandler(async (req: Request, res: Response) => {
  const id       = parseInt(req.params['id']!, 10);
  const b        = req.body as { is_active: string | number };
  const isActive = b.is_active === '1' || b.is_active === 1;
  const u        = await service.setActive(id, isActive);
  await logRepo.write({ level: 'info', category: 'users',
    message: 'admin ' + (u as { username?: string } | null)?.username + ' -> ' + (isActive ? 'activated' : 'deactivated'),
    userId: req.session.user!.id });
  req.flash('success', res.__('users.updated'));
  res.redirect('/users');
});
