import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as ctrl from './template.page.controller';

const router = Router();
router.use(requireAuth, requireRole('SUPER_ADMIN'));

// Page routes -- site template editor (SUPER_ADMIN only)
router.get('/',  ctrl.index);  // GET  /template
router.post('/', ctrl.update); // POST /template

export default router;
