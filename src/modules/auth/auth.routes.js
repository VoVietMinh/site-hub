'use strict';

const express = require('express');
const ctrl = require('./auth.controller');

const router = express.Router();

router.get('/login', ctrl.showLogin);
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/lang/:locale', ctrl.switchLocale);

module.exports = router;
