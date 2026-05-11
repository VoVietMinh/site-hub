import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { index } from './log.page.controller';

const router = Router();

// Page routes -- log viewer
router.get('/', requireAuth, index); // GET /logs

export default router;
