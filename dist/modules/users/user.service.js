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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.createAdmin = createAdmin;
exports.listAdmins = listAdmins;
exports.setActive = setActive;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const repo = __importStar(require("./user.repository"));
const v = __importStar(require("../../utils/validators"));
async function authenticate({ username, password }) {
    if (!v.isValidUsername(username) || !v.isStrongPassword(password))
        return null;
    const u = await repo.findByUsername(username);
    if (!u || !u.is_active)
        return null;
    const ok = await bcryptjs_1.default.compare(password, u.password_hash);
    if (!ok)
        return null;
    return u;
}
async function createAdmin({ username, email, password }) {
    if (!v.isValidUsername(username))
        throw Object.assign(new Error('invalid username'), { status: 400 });
    if (!v.isValidEmail(email))
        throw Object.assign(new Error('invalid email'), { status: 400 });
    if (!v.isStrongPassword(password))
        throw Object.assign(new Error('password must be 8-128 chars'), { status: 400 });
    if (await repo.findByUsername(username))
        throw Object.assign(new Error('username already exists'), { status: 409 });
    if (await repo.findByEmail(email))
        throw Object.assign(new Error('email already exists'), { status: 409 });
    const hash = await bcryptjs_1.default.hash(password, 10);
    const user = await repo.create({ username, email, passwordHash: hash, role: 'ADMIN', isActive: true });
    if (!user)
        throw new Error('Failed to create user');
    return user;
}
async function listAdmins() {
    return repo.listAdmins();
}
async function setActive(id, isActive) {
    return repo.setActive(id, isActive);
}
//# sourceMappingURL=user.service.js.map