'use strict';

/**
 * Wraps an async route handler so thrown errors flow into Express' error
 * middleware without try/catch boilerplate in every controller.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
