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
exports.toggleActive = exports.create = exports.showCreate = exports.index = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const service = __importStar(require("./user.service"));
const logRepo = __importStar(require("../logs/log.repository"));
exports.index = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const admins = await service.listAdmins();
    res.render('users/index', { title: res.__('users.title'), admins });
});
const showCreate = (req, res) => {
    res.render('users/create', { title: res.__('users.create'), values: {} });
};
exports.showCreate = showCreate;
exports.create = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const u = await service.createAdmin({ username, email, password });
        await logRepo.write({ level: 'info', category: 'users',
            message: 'admin created: ' + u.username, userId: req.session.user.id });
        req.flash('success', res.__('users.created'));
        res.redirect('/users');
    }
    catch (err) {
        const e = err;
        req.flash('error', e.message);
        res.status(e.status ?? 400).render('users/create', {
            title: res.__('users.create'), values: { username, email },
        });
    }
});
exports.toggleActive = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const b = req.body;
    const isActive = b.is_active === '1' || b.is_active === 1;
    const u = await service.setActive(id, isActive);
    await logRepo.write({ level: 'info', category: 'users',
        message: 'admin ' + u?.username + ' -> ' + (isActive ? 'activated' : 'deactivated'),
        userId: req.session.user.id });
    req.flash('success', res.__('users.updated'));
    res.redirect('/users');
});
//# sourceMappingURL=user.page.controller.js.map