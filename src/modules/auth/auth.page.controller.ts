import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as userService from '../users/user.service';
import * as logRepo from '../logs/log.repository';

export const showLogin = (req: Request, res: Response): void => {
  if (req.session?.user) { res.redirect('/'); return; }
  res.render('auth/login', { title: res.__('auth.loginTitle'), layout: false, values: {} });
};

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const user = await userService.authenticate({ username, password });

  if (!user) {
    await logRepo.write({ level: 'warn', category: 'auth', message: 'failed login for username=' + username });
    req.flash('error', res.__('auth.invalidCredentials'));
    return res.status(401).render('auth/login', {
      title: res.__('auth.loginTitle'), layout: false, values: { username },
    });
  }

  req.session.user = { id: user.id as number, username: user.username as string, email: user.email as string, role: user.role as string };

  await logRepo.write({ level: 'info', category: 'auth', message: 'user logged in: ' + user.username, userId: user.id as number });

  const returnTo = req.session.returnTo ?? '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

export const logout = (req: Request, res: Response): void => {
  const username = req.session?.user?.username;
  req.session.destroy(() => {
    if (username) {
      logRepo.write({ level: 'info', category: 'auth', message: 'user logged out: ' + username }).catch(() => {});
    }
    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
};

export const switchLocale = (req: Request, res: Response): void => {
  const target = (req.params['locale'] ?? '').toLowerCase();
  if ((res.locals['supportedLocales'] as string[] | undefined)?.includes(target)) {
    res.cookie('lang', target, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: false });
  }
  res.redirect(req.get('referer') ?? '/');
};
