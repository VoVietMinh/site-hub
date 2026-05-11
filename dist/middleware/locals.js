"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localsMiddleware = localsMiddleware;
const config_1 = __importDefault(require("../config"));
function localsMiddleware(req, res, next) {
    res.locals['currentUser'] = req.session?.user ?? null;
    res.locals['appName'] = config_1.default.appName;
    res.locals['currentLocale'] = req.getLocale ? req.getLocale() : config_1.default.i18n.defaultLocale;
    res.locals['supportedLocales'] = config_1.default.i18n.supportedLocales;
    res.locals['path'] = req.path;
    res.locals['flash'] = {
        success: req.flash ? req.flash('success') : [],
        error: req.flash ? req.flash('error') : [],
        info: req.flash ? req.flash('info') : [],
    };
    next();
}
//# sourceMappingURL=locals.js.map