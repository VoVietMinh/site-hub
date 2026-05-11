"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const dashboard_page_controller_1 = require("./dashboard.page.controller");
const router = (0, express_1.Router)();
// Page routes -- dashboard index
router.get('/', auth_1.requireAuth, dashboard_page_controller_1.index); // GET /
exports.default = router;
//# sourceMappingURL=dashboard.page.routes.js.map