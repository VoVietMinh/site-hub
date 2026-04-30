'use strict';

const logRepo = require('../modules/logs/log.repository');

// 404
exports.notFound = function notFound(req, res) {
  res.status(404).render('errors/404', {
    title: 'Not Found',
    message: res.__ ? res.__('errors.notFound') : 'Not found'
  });
};

// Generic error handler
// eslint-disable-next-line no-unused-vars
exports.errorHandler = function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  logRepo
    .write({
      level: 'error',
      category: 'app',
      message: err.message,
      meta: { stack: err.stack, path: req.path, method: req.method },
      userId: req.session && req.session.user ? req.session.user.id : null
    })
    .catch(() => {});

  if (req.accepts('html')) {
    return res.status(status).render('errors/error', {
      title: 'Error',
      status,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
  }
  return res.status(status).json({ error: err.message });
};
