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
exports.start = start;
exports.stop = stop;
const repo = __importStar(require("./articles.repository"));
const articles_service_1 = require("./articles.service");
const logRepo = __importStar(require("../logs/log.repository"));
let _timer = null;
async function tick() {
    let rows;
    try {
        rows = await repo.claimScheduledArticles(5);
    }
    catch (err) {
        console.error('[scheduler] claimScheduledArticles error:', err.message);
        return;
    }
    if (!rows?.length)
        return;
    for (const article of rows) {
        (0, articles_service_1.publishArticle)(article.id).catch((err) => {
            console.error('[scheduler] publish failed for article #' + article.id + ':', err.message);
        });
    }
    await logRepo.write({
        level: 'info', category: 'articles',
        message: `[scheduler] Dispatched ${rows.length} scheduled article(s) for publishing`,
    }).catch(() => { });
}
function start(intervalMs = 60000) {
    if (_timer)
        return;
    _timer = setInterval(() => {
        tick().catch((err) => {
            console.error('[scheduler] tick error:', err.message);
        });
    }, intervalMs);
    if ('unref' in _timer)
        _timer.unref();
    console.log('[scheduler] Articles scheduler started (interval: ' + intervalMs + 'ms)');
}
function stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
}
//# sourceMappingURL=articles.scheduler.js.map