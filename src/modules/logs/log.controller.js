'use strict';

const logRepo = require('./log.repository');

exports.index = async function index(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;
  const category = req.query.category || null;
  const level = req.query.level || null;

  const [items, total, categories] = await Promise.all([
    logRepo.list({ limit, offset, category, level }),
    logRepo.count({ category, level }),
    logRepo.distinctCategories()
  ]);

  res.render('logs/index', {
    title: res.__('logs.title'),
    items,
    total,
    page,
    limit,
    pages: Math.max(Math.ceil(total / limit), 1),
    filter: { category, level },
    categories
  });
};
