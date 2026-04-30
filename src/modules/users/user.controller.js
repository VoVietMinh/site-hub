'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const service = require('./user.service');
const logRepo = require('../logs/log.repository');

exports.index = asyncHandler(async (req, res) => {
  const admins = service.listAdmins();
  res.render('users/index', {
    title: res.__('users.title'),
    admins
  });
});

exports.showCreate = function showCreate(req, res) {
  res.render('users/create', {
    title: res.__('users.create'),
    values: {}
  });
};

exports.create = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body || {};
  try {
    const u = await service.createAdmin({ username, email, password });
    await logRepo.write({
      level: 'info',
      category: 'users',
      message: `admin created: ${u.username}`,
      userId: req.session.user.id
    });
    req.flash('success', res.__('users.created'));
    res.redirect('/users');
  } catch (err) {
    req.flash('error', err.message);
    res.status(err.status || 400).render('users/create', {
      title: res.__('users.create'),
      values: { username, email }
    });
  }
});

exports.toggleActive = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const isActive = req.body.is_active === '1' || req.body.is_active === 1;
  const u = service.setActive(id, isActive);
  await logRepo.write({
    level: 'info',
    category: 'users',
    message: `admin ${u && u.username} -> ${isActive ? 'activated' : 'deactivated'}`,
    userId: req.session.user.id
  });
  req.flash('success', res.__('users.updated'));
  res.redirect('/users');
});
