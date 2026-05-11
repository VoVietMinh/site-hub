import { Request, Response, NextFunction } from 'express';
import config from '../config';

export function localsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.locals['currentUser']       = req.session?.user ?? null;
  res.locals['appName']           = config.appName;
  res.locals['currentLocale']     = req.getLocale ? req.getLocale() : config.i18n.defaultLocale;
  res.locals['supportedLocales']  = config.i18n.supportedLocales;
  res.locals['path']              = req.path;
  res.locals['flash']             = {
    success: req.flash ? req.flash('success') : [],
    error:   req.flash ? req.flash('error')   : [],
    info:    req.flash ? req.flash('info')    : [],
  };
  next();
}
