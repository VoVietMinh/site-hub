'use strict';

const express = require('express');
const ctrl = require('./content.controller');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/',                       ctrl.index);
router.get('/new',                    ctrl.showNew);
router.post('/',                      ctrl.start);
router.get('/:id/status',             ctrl.jobStatus);
router.get('/:id/keywords/:kid',      ctrl.keywordDetail);
router.get('/:id',                    ctrl.detail);
router.post('/:id/run',               ctrl.runJob);
router.post('/:id/dispatch-n8n',      ctrl.dispatchN8n);
router.post('/:id/keywords/:kid',           ctrl.updateKeyword);
router.post('/:id/keywords/:kid/run',       ctrl.runKeyword);
router.post('/:id/keywords/:kid/publish',   ctrl.publishKeyword);

module.exports = router;
