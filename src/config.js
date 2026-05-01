'use strict';

require('dotenv').config();
const path = require('path');

const config = {
  env:     process.env.NODE_ENV  || 'development',
  appName: process.env.APP_NAME  || 'Pelxa Control Panel',
  port:    parseInt(process.env.PORT, 10) || 3000,

  session: {
    secret:       process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    cookieMaxAge: 1000 * 60 * 60 * 8
  },

  db: {
    path: process.env.DB_PATH
      ? path.resolve(process.cwd(), process.env.DB_PATH)
      : path.resolve(process.cwd(), 'data', 'app.db')
  },

  superAdmin: {
    username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
    password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@123',
    email:    process.env.SUPER_ADMIN_EMAIL    || 'admin@example.com'
  },

  i18n: {
    defaultLocale:    process.env.DEFAULT_LOCALE || 'vi',
    supportedLocales: (process.env.SUPPORTED_LOCALES || 'vi,en')
      .split(',').map(function(s) { return s.trim(); }).filter(Boolean)
  },

  easyEngine: {
    binary: process.env.EE_BINARY || 'ee',
    ssh: {
      enabled: String(process.env.EE_OVER_SSH || 'false').toLowerCase() === 'true',
      host:    process.env.EE_SSH_HOST   || 'host.docker.internal',
      user:    process.env.EE_SSH_USER   || 'root',
      keyPath: process.env.EE_SSH_KEY_PATH || '/app/secrets/ee_key'
    }
  },

  n8n: {
    webhookUrl:   process.env.N8N_WEBHOOK_URL   || '',
    webhookToken: process.env.N8N_WEBHOOK_TOKEN || ''
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'mock',
    apiKey:   process.env.AI_API_KEY  || ''
  },

  images: {
    serperApiKey: process.env.SERPER_API_KEY || ''
  },

  // When running inside Docker, WP domains resolve to 127.0.0.1 (loopback).
  // Direct WP REST API calls to host.docker.internal instead, and pass the
  // real domain as the Host header so EE nginx-proxy routes correctly.
  // Override with WP_API_HOST env var for non-Docker setups.
  wpApiHost: process.env.WP_API_HOST || 'host.docker.internal'
};

module.exports = config;
