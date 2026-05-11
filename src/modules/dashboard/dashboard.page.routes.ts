import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { index } from './dashboard.page.controller';

const router = Router();

// Page routes -- dashboard index
router.get('/', requireAuth, index); // GET /

export default router;
