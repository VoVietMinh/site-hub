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
exports.ALLOWED_BINARIES = void 0;
exports.run = run;
exports.runOrThrow = runOrThrow;
const child_process_1 = require("child_process");
const logRepo = __importStar(require("../modules/logs/log.repository"));
exports.ALLOWED_BINARIES = new Set(['ee', 'wp', 'docker', 'ssh']);
const MAX_ARG_LEN = 65536;
function validateArgs(args) {
    if (!Array.isArray(args))
        throw new Error('args must be an array');
    for (const a of args) {
        if (typeof a !== 'string')
            throw new Error('every arg must be a string');
        if (a.length > MAX_ARG_LEN)
            throw new Error(`arg too long (>${MAX_ARG_LEN} chars)`);
        if (a.includes('\0'))
            throw new Error('NULL byte in arg is not allowed');
    }
}
function run(binary, args = [], opts = {}) {
    if (!exports.ALLOWED_BINARIES.has(binary)) {
        return Promise.reject(new Error(`binary "${binary}" is not allow-listed`));
    }
    validateArgs(args);
    const { cwd, timeoutMs = 5 * 60 * 1000, env, category = 'command' } = opts;
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(binary, args, {
            cwd,
            env: env ? { ...process.env, ...env } : process.env,
            shell: false,
        });
        let stdout = '';
        let stderr = '';
        let killedByTimeout = false;
        const timer = setTimeout(() => {
            killedByTimeout = true;
            child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (err) => {
            clearTimeout(timer);
            logRepo.write({ level: 'error', category, message: `spawn ${binary} failed`, meta: { args, error: err.message } }).catch(() => { });
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            const durationMs = Date.now() - started;
            const result = { code, stdout, stderr, durationMs };
            logRepo.write({
                level: code === 0 ? 'info' : 'warn',
                category,
                message: `${binary} ${args.join(' ')} → exit ${code} (${durationMs}ms)`,
                meta: { stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000), killedByTimeout },
            }).catch(() => { });
            if (killedByTimeout) {
                reject(new Error(`command timed out after ${timeoutMs}ms: ${binary} ${args.join(' ')}`));
                return;
            }
            resolve(result);
        });
    });
}
async function runOrThrow(binary, args, opts) {
    const r = await run(binary, args, opts);
    if (r.code !== 0) {
        const err = Object.assign(new Error(`${binary} ${args.join(' ')} failed with code ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`), { result: r });
        throw err;
    }
    return r;
}
//# sourceMappingURL=commandRunner.js.map