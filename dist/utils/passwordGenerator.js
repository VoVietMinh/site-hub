"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generate = generate;
const crypto_1 = __importDefault(require("crypto"));
function generate(length = 20) {
    const raw = crypto_1.default.randomBytes(24).toString('base64').replace(/[\/+=]/g, '');
    return raw.slice(0, length);
}
//# sourceMappingURL=passwordGenerator.js.map