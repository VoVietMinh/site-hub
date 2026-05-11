"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seed = seed;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connection_1 = require("./connection");
const config_1 = __importDefault(require("../../config"));
async function seed() {
    const existing = await (0, connection_1.queryOne)("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1");
    if (existing)
        return;
    const hash = await bcryptjs_1.default.hash(config_1.default.superAdmin.password, 10);
    await (0, connection_1.queryOne)(`INSERT INTO users (username, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'SUPER_ADMIN', TRUE)
     ON CONFLICT (username) DO NOTHING
     RETURNING *`, [config_1.default.superAdmin.username, config_1.default.superAdmin.email, hash]);
    console.log('Seeded SUPER_ADMIN:', config_1.default.superAdmin.username);
}
if (require.main === module) {
    seed()
        .then(() => { console.log('Seed complete.'); process.exit(0); })
        .catch((err) => {
        console.error('Seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map