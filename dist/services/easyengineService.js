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
exports.listSites = listSites;
exports.siteInfo = siteInfo;
exports.createSite = createSite;
exports.deleteSite = deleteSite;
exports.parseEeInfoTable = parseEeInfoTable;
const eeBridge_1 = require("./eeBridge");
const v = __importStar(require("../utils/validators"));
function tryParseJson(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return null;
    }
}
function parseEeInfoTable(raw) {
    const out = {};
    if (!raw || typeof raw !== 'string')
        return out;
    for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith('|') || !line.endsWith('|'))
            continue;
        const parts = line.split('|').map((s) => s.trim());
        if (parts.length !== 4)
            continue;
        const k = parts[1];
        const val = parts[2];
        if (!k)
            continue;
        out[k] = val;
    }
    return out;
}
function parsePlainList(stdout) {
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines
        .filter((l) => /^[a-z0-9.\-]+\.[a-z]{2,}/i.test(l))
        .map((l) => {
        const parts = l.split(/\s+/);
        return { site: parts[0], status: parts[1] ?? 'unknown' };
    });
}
async function listSites() {
    const r = await (0, eeBridge_1.runEE)(['site', 'list', '--format=json'], { category: 'easyengine' });
    if (r.code === 0) {
        const json = tryParseJson(r.stdout);
        if (Array.isArray(json))
            return json;
    }
    const r2 = await (0, eeBridge_1.runEE)(['site', 'list'], { category: 'easyengine' });
    if (r2.code !== 0)
        return [];
    return parsePlainList(r2.stdout);
}
async function siteInfo(domain) {
    v.assertDomain(domain);
    const r = await (0, eeBridge_1.runEE)(['site', 'info', domain, '--format=json'], { category: 'easyengine' });
    if (r.code === 0) {
        const json = tryParseJson(r.stdout);
        if (json)
            return { raw: r.stdout, table: {}, json };
    }
    const r2 = await (0, eeBridge_1.runEEOrThrow)(['site', 'info', domain], { category: 'easyengine' });
    return { raw: r2.stdout, table: parseEeInfoTable(r2.stdout), json: null };
}
async function createSite(domain, options = {}) {
    v.assertDomain(domain);
    const args = ['site', 'create', domain, `--type=${options.type ?? 'wp'}`];
    if (options.cache !== false)
        args.push('--cache');
    if (options.ssl)
        args.push('--ssl=le');
    if (options.title) {
        if (typeof options.title !== 'string' || options.title.length > 200)
            throw new Error('invalid title');
        args.push(`--title=${options.title}`);
    }
    if (options.adminUser) {
        if (!v.isValidUsername(options.adminUser))
            throw new Error('invalid admin user');
        args.push(`--admin-user=${options.adminUser}`);
    }
    if (options.adminPass) {
        if (!v.isStrongPassword(options.adminPass))
            throw new Error('invalid admin password');
        args.push(`--admin-pass=${options.adminPass}`);
    }
    if (options.adminEmail) {
        if (!v.isValidEmail(options.adminEmail))
            throw new Error('invalid admin email');
        args.push(`--admin-email=${options.adminEmail}`);
    }
    return (0, eeBridge_1.runEEOrThrow)(args, { category: 'easyengine', timeoutMs: 30 * 60 * 1000 });
}
async function deleteSite(domain) {
    v.assertDomain(domain);
    return (0, eeBridge_1.runEEOrThrow)(['site', 'delete', domain, '--yes'], {
        category: 'easyengine', timeoutMs: 10 * 60 * 1000,
    });
}
//# sourceMappingURL=easyengineService.js.map