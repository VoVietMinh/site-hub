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
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const ctrl = __importStar(require("./articles.api.controller"));
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
// ── Static paths first (must precede /:id wildcard) ──────────────────────────
// POST /api/articles/keywords
router.post('/keywords', ctrl.generateKeywords);
// GET  /api/articles/sites/:siteId/categories
router.get('/sites/:siteId/categories', ctrl.siteCategories);
// ── Dynamic article actions ───────────────────────────────────────────────────
// GET  /api/articles/:id/status
router.get('/:id/status', ctrl.status);
// POST /api/articles/:id/build
router.post('/:id/build', ctrl.build);
// POST /api/articles/:id/retry
router.post('/:id/retry', ctrl.retry);
// POST /api/articles/:id/publish
router.post('/:id/publish', ctrl.publish);
// POST /api/articles/:id/update
router.post('/:id/update', ctrl.update);
exports.default = router;
//# sourceMappingURL=articles.api.routes.js.map