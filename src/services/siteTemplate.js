'use strict';

/**
 * Site template — the single source of truth for what every newly-created
 * WordPress site should look like.
 *
 * Stored as JSON at  <DATA_DIR>/site-template.json  (next to the SQLite DB).
 * Auto-created with sensible defaults on first read so the panel works
 * out-of-the-box, and editable directly on the host filesystem.
 *
 * Schema:
 *   {
 *     theme:    "newspare",
 *     plugins:  ["auto-upload-images", ...],
 *     options:  { timezone_string: "Asia/Ho_Chi_Minh", permalink_structure: "..." },
 *     menuName: "Main Menu",
 *     pages:    [ { slug, title, menuTitle, content }, ... ]
 *   }
 *
 * The `title` and `content` fields support placeholders that are replaced
 * per-site at create time:
 *   {websiteName}  – site title (or domain when no title)
 *   {description}  – site description from the form
 *   {domain}       – the bare domain
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(path.dirname(config.db.path), 'site-template.json');

const DEFAULT = Object.freeze({
  theme: 'newspare',
  plugins: [
    'auto-upload-images',
    'ip2location-country-blocker',
    'seo-by-rank-math',
    'json-api-auth'
  ],
  options: {
    timezone_string: 'Asia/Ho_Chi_Minh',
    permalink_structure: '/%category%/%postname%/'
  },
  menuName: 'Main Menu',
  pages: [
    {
      slug: 'about-us',
      title: 'About Us',
      menuTitle: 'About Us',
      content:
        '<h1>About {websiteName}</h1>\n' +
        '<p>{websiteName} is built to provide helpful, reliable and high-quality content for our readers.</p>\n' +
        '<p>{description}</p>'
    },
    {
      slug: 'contact-us',
      title: 'Contact Us',
      menuTitle: 'Contact Us',
      content:
        '<h1>Contact Us</h1>\n' +
        '<p>If you have any questions, partnership requests or support needs, please contact us.</p>\n' +
        '<p>Email: contact@{domain}</p>'
    },
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      menuTitle: 'Privacy Policy',
      content:
        '<h1>Privacy Policy</h1>\n' +
        '<p>At {websiteName}, we respect user privacy and are committed to protecting personal information.</p>\n' +
        '<p>This website may collect basic analytics, contact information and usage data to improve our service.</p>'
    },
    {
      slug: 'terms-of-service',
      title: 'Terms of Service',
      menuTitle: 'Terms of Service',
      content:
        '<h1>Terms of Service</h1>\n' +
        '<p>By using {websiteName}, you agree to use the website responsibly and comply with applicable laws.</p>\n' +
        '<p>{description}</p>'
    },
    {
      slug: 'disclaimer',
      title: 'Disclaimer',
      menuTitle: 'Disclaimer',
      content:
        '<h1>Disclaimer</h1>\n' +
        '<p>The content on {websiteName} is provided for general information purposes only.</p>\n' +
        '<p>We do our best to keep information accurate and updated.</p>'
    }
  ]
});

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function load() {
  try {
    if (!fs.existsSync(FILE)) {
      save(clone(DEFAULT));
      return clone(DEFAULT);
    }
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Merge with defaults so older files pick up new fields automatically.
    return { ...clone(DEFAULT), ...parsed };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('site-template.json invalid, falling back to defaults:', e.message);
    return clone(DEFAULT);
  }
}

function save(tpl) {
  if (!tpl || typeof tpl !== 'object') throw new Error('template must be object');
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(tpl, null, 2));
  return tpl;
}

/**
 * Replace {key} placeholders in a string. Unknown keys are left untouched.
 */
function applyTemplate(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
  );
}

module.exports = { load, save, applyTemplate, FILE, DEFAULT: clone(DEFAULT) };
