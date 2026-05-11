import { Request, Response, NextFunction } from 'express';
import * as logRepo from '../modules/logs/log.repository';

export function notFound(req: Request, res: Response): void {
  // API callers get JSON; page requests get the HTML 404 view
  if (req.originalUrl.startsWith('/api/') || !req.accepts('html')) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(404).render('errors/404', {
    title:   'Not Found',
    message: res.__ ? res.__('errors.notFound') : 'Not found',
  });
}

export function errorHandler(
  err: Error & { status?: number },
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.status ?? 500;
  console.error('[error]', err);

  logRepo
    .write({
      level:    'error',
      category: 'app',
      message:  err.message,
      meta:     { stack: err.stack, path: req.path, method: req.method },
      userId:   req.session?.user?.id ?? null,
    })
    .catch(() => {});

  if (req.accepts('html')) {
    res.status(status).render('errors/error', {
      title:   'Error',
      status,
      message: err.message,
      stack:   process.env['NODE_ENV'] === 'production' ? null : err.stack,
    });
    return;
  }
  res.status(status).json({ error: err.message });
}
