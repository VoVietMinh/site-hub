import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as ctrl from './articles.page.controller';

const router = Router();
router.use(requireAuth);

// Page routes -- return HTML
router.get('/',    ctrl.index);   // /articles
router.get('/:id', ctrl.detail);  // /articles/:id

export default router;
