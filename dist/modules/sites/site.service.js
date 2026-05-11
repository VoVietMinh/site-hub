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
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshFromEE = refreshFromEE;
exports.listLocal = listLocal;
exports.info = info;
exports.createFull = createFull;
exports.updateCredentials = updateCredentials;
exports.remove = remove;
const ee = __importStar(require("../../services/easyengineService"));
const wp = __importStar(require("../../services/wordpressService"));
const repo = __importStar(require("./site.repository"));
const v = __importStar(require("../../utils/validators"));
const logRepo = __importStar(require("../logs/log.repository"));
const passwordGenerator_1 = require("../../utils/passwordGenerator");
async function refreshFromEE(userId) {
    const list = await ee.listSites();
    for (const s of list) {
        const domain = s.site ?? s.domain ?? s.url ?? s.Site ?? s['site-url'];
        if (!domain)
            continue;
        await repo.upsert({
            domain: domain,
            site_type: (s.site_type ?? s.type ?? 'wp'),
            ssl: !!(s.ssl || s.SSL || s.https),
            status: (s.status ?? s.Status ?? 'active'),
            created_by: userId ?? null,
        });
    }
    return repo.listAll();
}
async function listLocal() {
    return repo.listAll();
}
async function info(domain) {
    v.assertDomain(domain);
    const local = await repo.findByDomain(domain);
    let eeInfo = { raw: null, table: {}, json: null };
    try {
        Object.assign(eeInfo, await ee.siteInfo(domain));
    }
    catch (e) {
        eeInfo.error = e.message;
    }
    let recentLogs = [];
    try {
        recentLogs = await logRepo.searchByMessage(domain, 30);
    }
    catch { /**/ }
    return { local, eeInfo, recentLogs };
}
async function createFull(params) {
    const { domain, ssl = false, category = 'Blog', userId } = params;
    v.assertDomain(domain);
    const finalAdminUser = params.adminUser?.trim() || 'admin';
    const finalAdminEmail = params.adminEmail?.trim() || ('admin@' + domain);
    const generatedPass = !params.adminPass?.trim();
    const finalAdminPass = generatedPass ? (0, passwordGenerator_1.generate)(20) : params.adminPass;
    const siteTitle = params.title?.trim() || domain;
    await logRepo.write({ level: 'info', category: 'sites', message: 'creating site ' + domain, userId: userId ?? null });
    try {
        await ee.createSite(domain, {
            type: 'wp', cache: true, ssl,
            title: siteTitle, adminUser: finalAdminUser,
            adminPass: finalAdminPass, adminEmail: finalAdminEmail,
        });
    }
    catch (err) {
        const txt = err.message ?? '';
        if (/rateLimited|too many certificates/i.test(txt)) {
            throw new Error("Let's Encrypt rate limit hit for \"" + domain + '\". Re-create WITHOUT SSL. Original: ' + txt);
        }
        throw err;
    }
    await repo.upsert({ domain, site_type: 'wp', ssl: !!ssl, status: 'configuring',
        title: siteTitle, description: params.description ?? null, created_by: userId ?? null });
    const cfg = await wp.configureNewSite(domain, {
        title: siteTitle, description: params.description ?? '', category,
    });
    await repo.upsert({ domain, status: 'active', title: siteTitle,
        description: params.description ?? null, created_by: userId ?? null,
        wp_user: finalAdminUser, wp_pass: finalAdminPass });
    await logRepo.write({ level: 'info', category: 'sites',
        message: 'site ' + domain + ' configured', meta: cfg, userId: userId ?? null });
    return {
        site: await repo.findByDomain(domain),
        cfg,
        credentials: {
            url: (ssl ? 'https' : 'http') + '://' + domain,
            adminUrl: (ssl ? 'https' : 'http') + '://' + domain + '/wp-admin',
            user: finalAdminUser,
            password: finalAdminPass,
            email: finalAdminEmail,
            passwordGenerated: generatedPass,
        },
    };
}
async function updateCredentials(domain, wp_user, wp_pass) {
    v.assertDomain(domain);
    return repo.updateCredentials(domain, wp_user || null, wp_pass || null);
}
async function remove(domain, userId) {
    v.assertDomain(domain);
    await ee.deleteSite(domain);
    await repo.remove(domain);
    await logRepo.write({ level: 'info', category: 'sites',
        message: 'site ' + domain + ' deleted', userId: userId ?? null });
    return true;
}
//# sourceMappingURL=site.service.js.map