"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
function requireAuth(req, res, next) {
    if (req.session?.user)
        return next();
    // API routes always get JSON — a browser fetch sends Accept: */* which
    // matches HTML, so we must check the path instead of req.accepts().
    if (req.originalUrl.startsWith('/api/') || !req.accepts('html')) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    req.session.returnTo = req.originalUrl;
    res.redirect('/auth/login');
}
function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.session?.user;
        if (!user) {
            res.redirect('/auth/login');
            return;
        }
        if (!roles.includes(user.role)) {
            res.status(403).render('errors/403', {
                title: 'Forbidden',
                message: res.__('errors.forbidden'),
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map