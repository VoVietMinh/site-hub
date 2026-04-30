'use strict';

const userService = require('../users/user.service');
const logRepo = require('../logs/log.repository');
const asyncHandler = require('../../utils/asyncHandler');

exports.showLogin = function showLogin(req, res) {
  if (req.session && req.session.user) return res.redirect('/');
  res.render('auth/login', {
    title: res.__('auth.loginTitle'),
    layout: false,
    values: {}
  });
};

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await userService.authenticate({ username, password });

  if (!user) {
    await logRepo.write({
      level: 'warn',
      category: 'auth',
      message: `failed login for username=${username}`
    });
    req.flash('error', res.__('auth.invalidCredentials'));
    return res.status(401).render('auth/login', {
      title: res.__('auth.loginTitle'),
      layout: false,
      values: { username }
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };

  await logRepo.write({
    level: 'info',
    category: 'auth',
    message: `user logged in: ${user.username}`,
    userId: user.id
  });

  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

exports.logout = function logout(req, res) {
  const username = req.session && req.session.user && req.session.user.username;
  req.session.destroy(() => {
    if (username) {
      logRepo
        .write({ level: 'info', category: 'auth', message: `user logged out: ${username}` })
        .catch(() => {});
    }
    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
};

exports.switchLocale = function switchLocale(req, res) {
  const target = (req.params.locale || '').toLowerCase();
  if (res.locals.supportedLocales.includes(target)) {
    res.cookie('lang', target, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: false });
  }
  const back = req.get('referer') || '/';
  res.redirect(back);
};
