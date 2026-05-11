"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT = exports.FILE = void 0;
exports.load = load;
exports.save = save;
exports.applyTemplate = applyTemplate;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.FILE = path_1.default.join(process.cwd(), 'data', 'site-template.json');
exports.DEFAULT = Object.freeze({
    theme: 'newspare',
    plugins: ['auto-upload-images', 'ip2location-country-blocker', 'seo-by-rank-math', 'json-api-auth'],
    options: { timezone_string: 'Asia/Ho_Chi_Minh', permalink_structure: '/%category%/%postname%/' },
    menuName: 'Main Menu',
    pages: [
        { slug: 'about-us', title: 'About Us', menuTitle: 'About Us', content: '<h1>About {websiteName}</h1>\n<p>{description}</p>' },
        { slug: 'contact-us', title: 'Contact Us', menuTitle: 'Contact Us', content: '<h1>Contact Us</h1>\n<p>Email: contact@{domain}</p>' },
        { slug: 'privacy-policy', title: 'Privacy Policy', menuTitle: 'Privacy Policy', content: '<h1>Privacy Policy</h1>\n<p>At {websiteName}, we respect user privacy.</p>' },
        { slug: 'terms-of-service', title: 'Terms of Service', menuTitle: 'Terms of Service', content: '<h1>Terms of Service</h1>\n<p>{description}</p>' },
        { slug: 'disclaimer', title: 'Disclaimer', menuTitle: 'Disclaimer', content: '<h1>Disclaimer</h1>\n<p>Content on {websiteName} is for informational purposes.</p>' },
    ],
});
function clone(o) {
    return JSON.parse(JSON.stringify(o));
}
function load() {
    try {
        if (!fs_1.default.existsSync(exports.FILE)) {
            save(clone(exports.DEFAULT));
            return clone(exports.DEFAULT);
        }
        const parsed = JSON.parse(fs_1.default.readFileSync(exports.FILE, 'utf8'));
        return { ...clone(exports.DEFAULT), ...parsed };
    }
    catch (e) {
        console.warn('site-template.json invalid, falling back to defaults:', e.message);
        return clone(exports.DEFAULT);
    }
}
function save(tpl) {
    if (!tpl || typeof tpl !== 'object')
        throw new Error('template must be object');
    fs_1.default.mkdirSync(path_1.default.dirname(exports.FILE), { recursive: true });
    fs_1.default.writeFileSync(exports.FILE, JSON.stringify(tpl, null, 2));
    return tpl;
}
function applyTemplate(str, vars) {
    return String(str || '').replace(/\{(\w+)\}/g, (m, key) => Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m);
}
//# sourceMappingURL=siteTemplate.js.map