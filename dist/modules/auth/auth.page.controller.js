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
exports.switchLocale = exports.logout = exports.login = exports.showLogin = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const userService = __importStar(require("../users/user.service"));
const logRepo = __importStar(require("../logs/log.repository"));
const showLogin = (req, res) => {
    if (req.session?.user) {
        res.redirect('/');
        return;
    }
    res.render('auth/login', { title: res.__('auth.loginTitle'), layout: false, values: {} });
};
exports.showLogin = showLogin;
exports.login = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { username, password } = req.body;
    const user = await userService.authenticate({ username, password });
    if (!user) {
        await logRepo.write({ level: 'warn', category: 'auth', message: 'failed login for username=' + username });
        req.flash('error', res.__('auth.invalidCredentials'));
        return res.status(401).render('auth/login', {
            title: res.__('auth.loginTitle'), layout: false, values: { username },
        });
    }
    req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
    await logRepo.write({ level: 'info', category: 'auth', message: 'user logged in: ' + user.username, userId: user.id });
    const returnTo = req.session.returnTo ?? '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
});
const logout = (req, res) => {
    const username = req.session?.user?.username;
    req.session.destroy(() => {
        if (username) {
            logRepo.write({ level: 'info', category: 'auth', message: 'user logged out: ' + username }).catch(() => { });
        }
        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
    });
};
exports.logout = logout;
const switchLocale = (req, res) => {
    const target = (req.params['locale'] ?? '').toLowerCase();
    if (res.locals['supportedLocales']?.includes(target)) {
        res.cookie('lang', target, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: false });
    }
    res.redirect(req.get('referer') ?? '/');
};
exports.switchLocale = switchLocale;
//# sourceMappingURL=auth.page.controller.js.map