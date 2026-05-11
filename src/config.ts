import 'dotenv/config';

interface SessionConfig {
  secret: string;
  cookieMaxAge: number;
}

interface EasyEngineConfig {
  binary: string;
  ssh: {
    enabled: boolean;
    host: string;
    user: string;
    keyPath: string;
  };
}

interface AppConfig {
  env: string;
  appName: string;
  port: number;
  session: SessionConfig;
  database: { url: string };
  superAdmin: { username: string; password: string; email: string };
  i18n: { defaultLocale: string; supportedLocales: string[] };
  easyEngine: EasyEngineConfig;
  n8n: { webhookUrl: string; webhookToken: string };
  ai: { provider: string; apiKey: string; model: string };
  images: { serperApiKey: string };
  articles: {
    defaultOutlineCount: number;
    defaultTone: string;
    sectionWordsMin: number;
    sectionWordsMax: number;
    tagCreateDelayMs: number;
  };
  wpApiHost: string;
}

const config: AppConfig = {
  env: process.env['NODE_ENV'] ?? 'development',
  appName: process.env['APP_NAME'] ?? 'Pelxa Control Panel',
  port: parseInt(process.env['PORT'] ?? '3000', 10) || 3000,

  session: {
    secret: process.env['SESSION_SECRET'] ?? 'dev-only-insecure-secret',
    cookieMaxAge: 1000 * 60 * 60 * 8,
  },

  database: {
    url:
      process.env['DATABASE_URL'] ??
      'postgres://panel_user:panelpass123@localhost:5432/panel_db',
  },

  superAdmin: {
    username: process.env['SUPER_ADMIN_USERNAME'] ?? 'superadmin',
    password: process.env['SUPER_ADMIN_PASSWORD'] ?? 'ChangeMe@123',
    email: process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@example.com',
  },

  i18n: {
    defaultLocale: process.env['DEFAULT_LOCALE'] ?? 'vi',
    supportedLocales: (process.env['SUPPORTED_LOCALES'] ?? 'vi,en')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  easyEngine: {
    binary: process.env['EE_BINARY'] ?? 'ee',
    ssh: {
      enabled:
        String(process.env['EE_OVER_SSH'] ?? 'false').toLowerCase() === 'true',
      host: process.env['EE_SSH_HOST'] ?? 'host.docker.internal',
      user: process.env['EE_SSH_USER'] ?? 'root',
      keyPath: process.env['EE_SSH_KEY_PATH'] ?? '/app/secrets/ee_key',
    },
  },

  n8n: {
    webhookUrl: process.env['N8N_WEBHOOK_URL'] ?? '',
    webhookToken: process.env['N8N_WEBHOOK_TOKEN'] ?? '',
  },

  ai: {
    provider: process.env['AI_PROVIDER'] ?? 'mock',
    apiKey: process.env['AI_API_KEY'] ?? '',
    model: process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash',
  },

  images: {
    serperApiKey: process.env['SERPER_API_KEY'] ?? '',
  },

  articles: {
    defaultOutlineCount:
      parseInt(process.env['ARTICLE_DEFAULT_OUTLINE_COUNT'] ?? '9', 10) || 9,
    defaultTone: process.env['ARTICLE_DEFAULT_TONE'] ?? 'natural, humanize',
    sectionWordsMin:
      parseInt(process.env['ARTICLE_SECTION_WORDS_MIN'] ?? '500', 10) || 500,
    sectionWordsMax:
      parseInt(process.env['ARTICLE_SECTION_WORDS_MAX'] ?? '700', 10) || 700,
    tagCreateDelayMs:
      parseInt(process.env['TAG_CREATE_DELAY_MS'] ?? '3000', 10) || 3000,
  },

  // When WP_API_HOST is set (e.g. 'host.docker.internal'), local EasyEngine sites
  // are proxied through the Docker host.  External/remote sites should set
  // direct_connect=true on the site record to bypass this proxy.
  // Leave WP_API_HOST unset (or empty) to call all sites directly.
  wpApiHost: process.env['WP_API_HOST'] ?? '',
};

export default config;
