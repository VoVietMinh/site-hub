'use strict';

const siteTemplate = require('../../services/siteTemplate');
const logRepo = require('../logs/log.repository');
const asyncHandler = require('../../utils/asyncHandler');

exports.index = function index(req, res) {
  const tpl = siteTemplate.load();
  res.render('template/index', {
    title: res.__('siteTemplate.title'),
    tpl,
    json: JSON.stringify(tpl, null, 2),
    filePath: siteTemplate.FILE
  });
};

exports.update = asyncHandler(async (req, res) => {
  const raw = (req.body && req.body.json) || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    req.flash('error', 'Invalid JSON: ' + e.message);
    return res.status(400).render('template/index', {
      title: res.__('siteTemplate.title'),
      tpl: null,
      json: raw,
      filePath: siteTemplate.FILE
    });
  }
  siteTemplate.save(parsed);
  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: 'site template updated',
    userId: req.session.user.id
  });
  req.flash('success', res.__('users.updated'));
  res.redirect('/template');
});
