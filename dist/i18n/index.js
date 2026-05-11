"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const i18n_1 = __importDefault(require("i18n"));
const config_1 = __importDefault(require("../config"));
i18n_1.default.configure({
    locales: config_1.default.i18n.supportedLocales,
    defaultLocale: config_1.default.i18n.defaultLocale,
    directory: path_1.default.join(__dirname, 'locales'),
    cookie: 'lang',
    queryParameter: 'lang',
    objectNotation: true,
    updateFiles: false,
    syncFiles: false,
});
exports.default = i18n_1.default;
//# sourceMappingURL=index.js.map