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
const ctrl = __importStar(require("./content.page.controller"));
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
// Page routes -- content jobs (return HTML / redirect)
router.get('/', ctrl.index); // GET  /content
router.get('/new', ctrl.showNew); // GET  /content/new
router.post('/', ctrl.start); // POST /content (start job)
router.get('/:id', ctrl.detail); // GET  /content/:id
router.get('/:id/keywords/:kid', ctrl.keywordDetail); // GET  /content/:id/keywords/:kid
router.post('/:id/run', ctrl.runJob); // POST /content/:id/run
router.post('/:id/dispatch-n8n', ctrl.dispatchN8n); // POST /content/:id/dispatch-n8n
router.post('/:id/keywords/:kid', ctrl.updateKeyword); // POST /content/:id/keywords/:kid
router.post('/:id/keywords/:kid/run', ctrl.runKeyword); // POST /content/:id/keywords/:kid/run
router.post('/:id/keywords/:kid/publish', ctrl.publishKeyword); // POST /content/:id/keywords/:kid/publish
exports.default = router;
//# sourceMappingURL=content.page.routes.js.map