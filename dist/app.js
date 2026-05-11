"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const connect_flash_1 = __importDefault(require("connect-flash"));
const morgan_1 = __importDefault(require("morgan"));
const method_override_1 = __importDefault(require("method-override"));
const express_ejs_layouts_1 = __importDefault(require("express-ejs-layouts"));
const config_1 = __importDefault(require("./config"));
const i18n_1 = __importDefault(require("./i18n"));
const migrate_1 = require("./infrastructure/db/migrate");
const seed_1 = require("./infrastructure/db/seed");
const connection_1 = require("./infrastructure/db/connection");
const locals_1 = require("./middleware/locals");
const errorHandler_1 = require("./middleware/errorHandler");
const web_1 = __importDefault(require("./routes/web"));
const api_1 = __importDefault(require("./routes/api"));
const articlesScheduler = __importStar(require("./modules/articles/articles.scheduler"));
const PgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
// ── Express app ───────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
app.set('views', path_1.default.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express_ejs_layouts_1.default);
app.set('layout', 'layouts/app');
app.use('/css', express_1.default.static(path_1.default.join(__dirname, 'public', 'css')));
app.use('/js', express_1.default.static(path_1.default.join(__dirname, 'public', 'js')));
app.use('/brand', express_1.default.static(path_1.default.join(__dirname, 'public', 'brand')));
app.get('/favicon.ico', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'public', 'brand', 'favicon.png'));
});
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, method_override_1.default)('_method'));
if (config_1.default.env !== 'test')
    app.use((0, morgan_1.default)('tiny'));
// Sessions -- PostgreSQL-backed via connect-pg-simple
app.use((0, express_session_1.default)({
    store: new PgSession({ pool: connection_1.pool, tableName: 'sessions' }),
    secret: config_1.default.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: config_1.default.session.cookieMaxAge,
    },
}));
app.use((0, connect_flash_1.default)());
app.use(i18n_1.default.init);
app.use(locals_1.localsMiddleware);
// ── Route mounting ─────────────────────────────────────────────────────────────
//
//  /api/*  → JSON API (articles status/build/publish, content status/categories)
//  /*      → MVC page routes (HTML views)
//
app.use('/api', api_1.default);
app.use('/', web_1.default);
app.get('/healthz', (_req, res) => {
    res.json({ ok: true, env: config_1.default.env });
});
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
// ── Boot sequence ─────────────────────────────────────────────────────────────
async function boot() {
    await (0, migrate_1.migrate)();
    await (0, seed_1.seed)();
    const port = config_1.default.port;
    const server = app.listen(port, () => {
        console.log('Panel listening on http://localhost:' + port);
        console.log('  default super admin: ' + config_1.default.superAdmin.username);
    });
    articlesScheduler.start();
    function gracefulShutdown(signal) {
        console.log(signal + ' received - shutting down...');
        server.close(() => {
            connection_1.pool.end(() => {
                console.log('DB pool closed. Exiting.');
                process.exit(0);
            });
        });
        const t = setTimeout(() => { process.exit(1); }, 10000);
        if ('unref' in t)
            t.unref();
    }
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
boot().catch((err) => {
    console.error('Boot failed:', err.message);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=app.js.map