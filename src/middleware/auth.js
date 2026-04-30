'use strict';

/**
 * Authentication / authorization middleware.
 *
 *   requireAuth   – any logged-in active user
 *   requireRole() – requires one of the listed roles
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.accepts('html')) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  return res.status(401).json({ error: 'unauthorized' });
}

function requireRole(...roles) {
  return function (req, res, next) {
    const user = req.session && req.session.user;
    if (!user) return res.redirect('/auth/login');
    if (!roles.includes(user.role)) {
      return res.status(403).render('errors/403', {
        title: 'Forbidden',
        message: res.__('errors.forbidden')
      });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
