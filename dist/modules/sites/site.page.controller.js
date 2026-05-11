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
exports.destroy = exports.updateCredentials = exports.detail = exports.create = exports.showCreate = exports.index = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const service = __importStar(require("./site.service"));
const v = __importStar(require("../../utils/validators"));
exports.index = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    let sites = [];
    let refreshError = null;
    try {
        sites = await service.refreshFromEE(req.session.user.id);
    }
    catch (e) {
        refreshError = e.message;
        sites = await service.listLocal();
    }
    const all = sites;
    const stats = {
        total: all.length,
        active: all.filter((s) => s.status === 'active').length,
        configuring: all.filter((s) => s.status === 'configuring').length,
        ssl: all.filter((s) => s.ssl).length,
    };
    res.render('sites/index', { title: res.__('sites.title'), sites, stats, refreshError });
});
const showCreate = (req, res) => {
    res.render('sites/create', { title: res.__('sites.create'), values: {} });
};
exports.showCreate = showCreate;
exports.create = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const b = req.body;
    const { domain, title, description, ssl, admin_user, admin_pass, admin_email, category } = b;
    if (!v.isValidDomain(domain)) {
        req.flash('error', res.__('sites.invalidDomain'));
        return res.status(400).render('sites/create', { title: res.__('sites.create'), values: req.body });
    }
    try {
        const result = await service.createFull({
            domain, title, description,
            ssl: ssl === 'on' || ssl === '1',
            adminUser: admin_user, adminPass: admin_pass, adminEmail: admin_email,
            category, userId: req.session.user.id,
        });
        res.render('sites/created', {
            title: res.__('sites.created', { domain: result.site.domain }),
            site: result.site, cfg: result.cfg, credentials: result.credentials,
        });
    }
    catch (err) {
        req.flash('error', err.message);
        res.status(500).render('sites/create', { title: res.__('sites.create'), values: req.body });
    }
});
exports.detail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const domain = req.params['domain'];
    v.assertDomain(domain);
    const data = await service.info(domain);
    res.render('sites/detail', {
        title: domain, domain,
        local: data.local, eeInfo: data.eeInfo,
        table: data.eeInfo?.table ?? {},
        recentLogs: data.recentLogs ?? [],
    });
});
exports.updateCredentials = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const domain = req.params['domain'];
    v.assertDomain(domain);
    const { wp_user, wp_pass } = req.body;
    await service.updateCredentials(domain, wp_user, wp_pass);
    req.flash('success', 'WordPress API credentials saved');
    res.redirect('/sites/' + encodeURIComponent(domain));
});
exports.destroy = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const domain = req.params['domain'];
    await service.remove(domain, req.session.user.id);
    req.flash('success', res.__('sites.deleted', { domain }));
    res.redirect('/sites');
});
//# sourceMappingURL=site.page.controller.js.map