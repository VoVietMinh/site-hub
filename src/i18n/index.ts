import path from 'path';
import i18n from 'i18n';
import config from '../config';

i18n.configure({
  locales:        config.i18n.supportedLocales,
  defaultLocale:  config.i18n.defaultLocale,
  directory:      path.join(__dirname, 'locales'),
  cookie:         'lang',
  queryParameter: 'lang',
  objectNotation: true,
  updateFiles:    false,
  syncFiles:      false,
});

export default i18n;
