import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as ctrl from './user.page.controller';

const router = Router();
router.use(requireAuth, requireRole('SUPER_ADMIN'));

// Page routes -- user management (SUPER_ADMIN only)
router.get('/',                 ctrl.index);        // GET  /users
router.get('/new',              ctrl.showCreate);   // GET  /users/new
router.post('/',                ctrl.create);       // POST /users
router.post('/:id/toggle-active', ctrl.toggleActive); // POST /users/:id/toggle-active

export default router;
