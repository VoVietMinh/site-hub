'use strict';

const path = require('path');
const i18n = require('i18n');
const config = require('../config');

i18n.configure({
  locales: config.i18n.supportedLocales,
  defaultLocale: config.i18n.defaultLocale,
  directory: path.join(__dirname, 'locales'),
  cookie: 'lang',
  queryParameter: 'lang',
  objectNotation: true,
  updateFiles: false,
  syncFiles: false
});

module.exports = i18n;
