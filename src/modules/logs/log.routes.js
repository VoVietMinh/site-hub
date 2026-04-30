'use strict';

const express = require('express');
const ctrl = require('./log.controller');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, ctrl.index);

module.exports = router;
