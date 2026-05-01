'use strict';

/**
 * EE Control Panel — application entry point.
 *
 * Boot sequence:
 *   1. load .env / config
 *   2. run DB migrations + super-admin seed
 *   3. wire express middleware (sessions, i18n, flash, locals, view engine)
 *   4. mount module routes
 *   5. register error handlers
 *   6. listen
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const morgan = require('morgan');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const config = require('./config');
const i18n = require('./i18n');
const { migrate } = require('./infrastructure/db/migrate');
const { seed } = require('./infrastructure/db/seed');
const localsMiddleware = require('./middleware/locals');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./modules/auth/auth.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const siteRoutes = require('./modules/sites/site.routes');
const contentRoutes = require('./modules/content/content.routes');
const userRoutes = require('./modules/users/user.routes');
const logRoutes = require('./modules/logs/log.routes');
const templateRoutes = require('./modules/template/template.routes');

// --- 1. DB migrate + seed --------------------------------------------------
migrate();
seed();

// --- 2. Express ------------------------------------------------------------
const app = express();

// View engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/app');

// Static
app.use('/css',   express.static(path.join(__dirname, 'public', 'css')));
app.use('/js',    express.static(path.join(__dirname, 'public', 'js')));
app.use('/brand', express.static(path.join(__dirname, 'public', 'brand')));
app.get('/favicon.ico', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'brand', 'favicon.png'))
);

// Body + method override
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));

// Logging (skip in test)
if (config.env !== 'test') app.use(morgan('tiny'));

// Sessions
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set behind https proxy via trust proxy + secure:true if needed
      maxAge: config.session.cookieMaxAge
    }
  })
);

// Flash
app.use(flash());

// i18n
app.use(i18n.init);

// view locals (currentUser, flash, locale, etc.)
app.use(localsMiddleware);

// --- 3. Routes -------------------------------------------------------------
app.use('/auth', authRoutes);
app.use('/', dashboardRoutes);
app.use('/sites', siteRoutes);
app.use('/content', contentRoutes);
app.use('/users', userRoutes);
app.use('/logs', logRoutes);
app.use('/template', templateRoutes);

// Health
app.get('/healthz', (req, res) => res.json({ ok: true, env: config.env }));

// --- 4. Errors -------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// --- 5. Listen -------------------------------------------------------------
const port = config.port;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`▸ ${config.appName} listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`  default super admin: ${config.superAdmin.username} (set via .env)`);
});

module.exports = app;
