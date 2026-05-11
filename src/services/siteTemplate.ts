import fs from 'fs';
import path from 'path';

export interface SitePage {
  slug: string;
  title: string;
  menuTitle: string;
  content: string;
}

export interface SiteTemplate {
  theme: string;
  plugins: string[];
  options: Record<string, string>;
  menuName: string;
  pages: SitePage[];
}

export const FILE = path.join(process.cwd(), 'data', 'site-template.json');

export const DEFAULT: Readonly<SiteTemplate> = Object.freeze({
  theme: 'newspare',
  plugins: ['auto-upload-images', 'ip2location-country-blocker', 'seo-by-rank-math', 'json-api-auth'],
  options: { timezone_string: 'Asia/Ho_Chi_Minh', permalink_structure: '/%category%/%postname%/' },
  menuName: 'Main Menu',
  pages: [
    { slug: 'about-us',         title: 'About Us',         menuTitle: 'About Us',         content: '<h1>About {websiteName}</h1>\n<p>{description}</p>' },
    { slug: 'contact-us',       title: 'Contact Us',       menuTitle: 'Contact Us',       content: '<h1>Contact Us</h1>\n<p>Email: contact@{domain}</p>' },
    { slug: 'privacy-policy',   title: 'Privacy Policy',   menuTitle: 'Privacy Policy',   content: '<h1>Privacy Policy</h1>\n<p>At {websiteName}, we respect user privacy.</p>' },
    { slug: 'terms-of-service', title: 'Terms of Service', menuTitle: 'Terms of Service', content: '<h1>Terms of Service</h1>\n<p>{description}</p>' },
    { slug: 'disclaimer',       title: 'Disclaimer',       menuTitle: 'Disclaimer',       content: '<h1>Disclaimer</h1>\n<p>Content on {websiteName} is for informational purposes.</p>' },
  ],
});

function clone(o: SiteTemplate): SiteTemplate {
  return JSON.parse(JSON.stringify(o)) as SiteTemplate;
}

export function load(): SiteTemplate {
  try {
    if (!fs.existsSync(FILE)) { save(clone(DEFAULT)); return clone(DEFAULT); }
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as SiteTemplate;
    return { ...clone(DEFAULT), ...parsed };
  } catch (e) {
    console.warn('site-template.json invalid, falling back to defaults:', (e as Error).message);
    return clone(DEFAULT);
  }
}

export function save(tpl: SiteTemplate): SiteTemplate {
  if (!tpl || typeof tpl !== 'object') throw new Error('template must be object');
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(tpl, null, 2));
  return tpl;
}

export function applyTemplate(str: string, vars: Record<string, string>): string {
  return String(str || '').replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
  );
}
