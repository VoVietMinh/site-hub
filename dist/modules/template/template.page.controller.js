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
exports.update = exports.index = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const siteTemplate = __importStar(require("../../services/siteTemplate"));
const logRepo = __importStar(require("../logs/log.repository"));
const index = (req, res) => {
    const tpl = siteTemplate.load();
    res.render('template/index', {
        title: res.__('siteTemplate.title'),
        tpl,
        filePath: siteTemplate.FILE,
    });
};
exports.index = index;
function toArray(v) {
    if (v === undefined || v === null)
        return [];
    if (Array.isArray(v))
        return v;
    return [v];
}
exports.update = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const b = req.body;
    const theme = String(b['theme'] ?? '').trim() || 'newspare';
    const menuName = String(b['menuName'] ?? '').trim() || 'Main Menu';
    const plugins = toArray(b['plugins']).map((s) => String(s ?? '').trim()).filter(Boolean);
    const optKeys = toArray(b['optionKeys']);
    const optVals = toArray(b['optionValues']);
    const options = {};
    for (let i = 0; i < optKeys.length; i++) {
        const k = String(optKeys[i] ?? '').trim();
        if (!k)
            continue;
        options[k] = String(optVals[i] ?? '');
    }
    const rawPages = b['pages'] ?? {};
    const pageList = Array.isArray(rawPages) ? rawPages : Object.values(rawPages);
    const pages = [];
    for (const p of pageList) {
        if (!p || typeof p !== 'object')
            continue;
        const po = p;
        const slug = String(po['slug'] ?? '').trim();
        if (!slug)
            continue;
        const title = String(po['title'] ?? '').trim() || slug;
        pages.push({
            slug,
            title,
            menuTitle: String(po['menuTitle'] ?? '').trim() || title,
            content: String(po['content'] ?? ''),
        });
    }
    const tpl = { theme, plugins, options, menuName, pages };
    siteTemplate.save(tpl);
    await logRepo.write({
        level: 'info', category: 'sites',
        message: 'site template updated',
        userId: req.session.user.id,
    });
    req.flash('success', res.__('users.updated'));
    res.redirect('/template');
});
//# sourceMappingURL=template.page.controller.js.map