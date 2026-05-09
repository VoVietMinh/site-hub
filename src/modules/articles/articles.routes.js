'use strict';

const express = require('express');
const ctrl    = require('./articles.controller');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Static paths first (must come before /:id wildcard)
router.get('/', ctrl.index);
router.get('/sites/:siteId/categories', ctrl.siteCategories);
router.post('/keywords', ctrl.generateKeywords);

// Dynamic article routes
router.get('/:id',          ctrl.detail);
router.get('/:id/status',   ctrl.status);
router.post('/:id/build',   ctrl.build);
router.post('/:id/retry',   ctrl.retry);
router.post('/:id/publish', ctrl.publish);
router.post('/:id/update',  ctrl.update);

module.exports = router;
