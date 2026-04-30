'use strict';

const express = require('express');
const ctrl = require('./site.controller');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.index);
router.get('/new', ctrl.showCreate);
router.post('/', ctrl.create);
router.get('/:domain', ctrl.detail);
router.delete('/:domain', ctrl.destroy);
router.post('/:domain/delete', ctrl.destroy); // form-friendly fallback

module.exports = router;
