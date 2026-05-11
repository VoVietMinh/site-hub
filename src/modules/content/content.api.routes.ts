import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as ctrl from './content.api.controller';

const router = Router();
router.use(requireAuth);

// API routes -- JSON responses for content jobs
router.get('/:id/categories',      ctrl.getCategories);   // GET /api/content/:id/categories
router.get('/:id/status',          ctrl.jobStatus);        // GET /api/content/:id/status
router.get('/:id/check-connection', ctrl.checkConnection); // GET /api/content/:id/check-connection

export default router;
