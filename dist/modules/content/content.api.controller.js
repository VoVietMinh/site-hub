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
exports.checkConnection = exports.jobStatus = exports.getCategories = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const service = __importStar(require("./content.service"));
/** GET /api/content/:id/categories -- WP categories for job's site */
exports.getCategories = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    try {
        const result = await service.getJobCategories(id);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message, categories: [] });
    }
});
/** GET /api/content/:id/status -- poll job + keywords status */
exports.jobStatus = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    const data = await service.getJobStatus(id);
    if (!data)
        return res.status(404).json({ error: 'not found' });
    res.json(data);
});
/** GET /api/content/:id/check-connection -- verify WP API connectivity */
exports.checkConnection = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params['id'], 10);
    try {
        const result = await service.checkJobConnection(id);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
//# sourceMappingURL=content.api.controller.js.map