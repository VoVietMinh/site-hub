"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEE = runEE;
exports.runEEOrThrow = runEEOrThrow;
const commandRunner_1 = require("./commandRunner");
const config_1 = __importDefault(require("../config"));
const SSH_OPTS = [
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'UserKnownHostsFile=/tmp/ee_known_hosts',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
];
function shellQuote(arg) {
    const s = String(arg);
    if (s === '')
        return "''";
    if (/^[A-Za-z0-9_./:=,\-+@]+$/.test(s))
        return s;
    return "'" + s.replace(/'/g, "'\\''") + "'";
}
function buildArgs(eeArgs) {
    if (!Array.isArray(eeArgs))
        throw new Error('eeArgs must be an array');
    if (config_1.default.easyEngine.ssh.enabled) {
        const remoteCommand = eeArgs.map(shellQuote).join(' ');
        return {
            binary: 'ssh',
            args: [
                '-i', config_1.default.easyEngine.ssh.keyPath,
                ...SSH_OPTS,
                `${config_1.default.easyEngine.ssh.user}@${config_1.default.easyEngine.ssh.host}`,
                remoteCommand,
            ],
        };
    }
    return { binary: config_1.default.easyEngine.binary, args: eeArgs };
}
async function runEE(eeArgs, opts = {}) {
    const { binary, args } = buildArgs(eeArgs);
    return (0, commandRunner_1.run)(binary, args, opts);
}
async function runEEOrThrow(eeArgs, opts = {}) {
    const { binary, args } = buildArgs(eeArgs);
    return (0, commandRunner_1.runOrThrow)(binary, args, opts);
}
//# sourceMappingURL=eeBridge.js.map