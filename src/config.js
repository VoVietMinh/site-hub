'use strict';

/**
 * Centralized configuration. Reads from environment variables with sensible
 * defaults so the panel runs on Windows (dev) and Ubuntu (prod) the same way.
 */

require('dotenv').config();

const path = require('path');

const config = {
  env: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'EE Control Panel',
  port: parseInt(process.env.PORT, 10) || 3000,

  session: {
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    cookieMaxAge: 1000 * 60 * 60 * 8 // 8 hours
  },

  db: {
    path: process.env.DB_PATH
      ? path.resolve(process.cwd(), process.env.DB_PATH)
      : path.resolve(process.cwd(), 'data', 'app.db')
  },

  superAdmin: {
    username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
    password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@123',
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@example.com'
  },

  i18n: {
    defaultLocale: process.env.DEFAULT_LOCALE || 'vi',
    supportedLocales: (process.env.SUPPORTED_LOCALES || 'vi,en')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  },

  easyEngine: {
    binary: process.env.EE_BINARY || 'ee'
  },

  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || '',
    webhookToken: process.env.N8N_WEBHOOK_TOKEN || ''
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'mock',
    apiKey: process.env.AI_API_KEY || ''
  },

  images: {
    serpApiKey: process.env.SERPAPI_KEY || '',
    googleCseId: process.env.GOOGLE_CSE_ID || '',
    googleCseKey: process.env.GOOGLE_CSE_KEY || ''
  }
};

module.exports = config;
