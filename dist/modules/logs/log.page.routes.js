"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const log_page_controller_1 = require("./log.page.controller");
const router = (0, express_1.Router)();
// Page routes -- log viewer
router.get('/', auth_1.requireAuth, log_page_controller_1.index); // GET /logs
exports.default = router;
//# sourceMappingURL=log.page.routes.js.map