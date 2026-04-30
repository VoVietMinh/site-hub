'use strict';

/**
 * Exposes a few values to every view (current user, flash, locale toggle).
 */

const config = require('../config');

module.exports = function locals(req, res, next) {
  res.locals.currentUser = (req.session && req.session.user) || null;
  res.locals.appName = config.appName;
  res.locals.currentLocale = req.getLocale ? req.getLocale() : config.i18n.defaultLocale;
  res.locals.supportedLocales = config.i18n.supportedLocales;
  res.locals.path = req.path;
  res.locals.flash = {
    success: req.flash ? req.flash('success') : [],
    error: req.flash ? req.flash('error') : [],
    info: req.flash ? req.flash('info') : []
  };
  next();
};
