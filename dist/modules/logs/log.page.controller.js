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
exports.index = index;
const logRepo = __importStar(require("./log.repository"));
async function index(req, res) {
    const limit = Math.min(parseInt(req.query['limit'], 10) || 200, 1000);
    const page = Math.max(parseInt(req.query['page'], 10) || 1, 1);
    const offset = (page - 1) * limit;
    const category = req.query['category'] || null;
    const level = req.query['level'] || null;
    const [items, total, categories] = await Promise.all([
        logRepo.list({ limit, offset, category, level }),
        logRepo.count({ category, level }),
        logRepo.distinctCategories(),
    ]);
    res.render('logs/index', {
        title: res.__('logs.title'),
        items, total, page, limit,
        pages: Math.max(Math.ceil(total / limit), 1),
        filter: { category, level },
        categories,
    });
}
//# sourceMappingURL=log.page.controller.js.map