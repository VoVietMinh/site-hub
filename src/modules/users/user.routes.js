'use strict';

const express = require('express');
const ctrl = require('./user.controller');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

// All admin-management endpoints are SUPER_ADMIN only.
router.use(requireAuth, requireRole('SUPER_ADMIN'));

router.get('/', ctrl.index);
router.get('/new', ctrl.showCreate);
router.post('/', ctrl.create);
router.post('/:id/toggle-active', ctrl.toggleActive);

module.exports = router;
