import path from 'path';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import flash from 'connect-flash';
import morgan from 'morgan';
import methodOverride from 'method-override';
import expressLayouts from 'express-ejs-layouts';

import config from './config';
import i18n from './i18n';
import { migrate } from './infrastructure/db/migrate';
import { seed } from './infrastructure/db/seed';
import { pool } from './infrastructure/db/connection';
import { localsMiddleware } from './middleware/locals';
import { notFound, errorHandler } from './middleware/errorHandler';

import webRouter from './routes/web';
import apiRouter from './routes/api';
import * as articlesScheduler from './modules/articles/articles.scheduler';

const PgSession = connectPgSimple(session);

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/app');

app.use('/css',   express.static(path.join(__dirname, 'public', 'css')));
app.use('/js',    express.static(path.join(__dirname, 'public', 'js')));
app.use('/brand', express.static(path.join(__dirname, 'public', 'brand')));
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'brand', 'favicon.png'));
});

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));

if (config.env !== 'test') app.use(morgan('tiny'));

// Sessions -- PostgreSQL-backed via connect-pg-simple
app.use(
  session({
    store: new PgSession({ pool, tableName: 'sessions' }),
    secret:           config.session.secret,
    resave:           false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure:   false,
      maxAge:   config.session.cookieMaxAge,
    },
  })
);

app.use(flash());
app.use(i18n.init);
app.use(localsMiddleware);

// ── Route mounting ─────────────────────────────────────────────────────────────
//
//  /api/*  → JSON API (articles status/build/publish, content status/categories)
//  /*      → MVC page routes (HTML views)
//
app.use('/api', apiRouter);
app.use('/',    webRouter);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, env: config.env });
});

app.use(notFound);
app.use(errorHandler);

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  await migrate();
  await seed();

  const port   = config.port;
  const server = app.listen(port, () => {
    console.log('Panel listening on http://localhost:' + port);
    console.log('  default super admin: ' + config.superAdmin.username);
  });

  articlesScheduler.start();

  function gracefulShutdown(signal: string): void {
    console.log(signal + ' received - shutting down...');
    server.close(() => {
      pool.end(() => {
        console.log('DB pool closed. Exiting.');
        process.exit(0);
      });
    });
    const t = setTimeout(() => { process.exit(1); }, 10000);
    if ('unref' in t) (t as { unref(): void }).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
}

boot().catch((err: unknown) => {
  console.error('Boot failed:', (err as Error).message);
  process.exit(1);
});

export default app;
