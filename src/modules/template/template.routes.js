'use strict';

const express = require('express');
const ctrl = require('./template.controller');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('SUPER_ADMIN'));

router.get('/', ctrl.index);
router.post('/', ctrl.update);

module.exports = router;
