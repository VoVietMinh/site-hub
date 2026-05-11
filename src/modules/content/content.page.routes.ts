import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as ctrl from './content.page.controller';

const router = Router();
router.use(requireAuth);

// Page routes -- content jobs (return HTML / redirect)
router.get('/',                              ctrl.index);          // GET  /content
router.get('/new',                           ctrl.showNew);        // GET  /content/new
router.post('/',                             ctrl.start);          // POST /content (start job)
router.get('/:id',                           ctrl.detail);         // GET  /content/:id
router.get('/:id/keywords/:kid',             ctrl.keywordDetail);  // GET  /content/:id/keywords/:kid
router.post('/:id/run',                      ctrl.runJob);         // POST /content/:id/run
router.post('/:id/dispatch-n8n',             ctrl.dispatchN8n);    // POST /content/:id/dispatch-n8n
router.post('/:id/keywords/:kid',            ctrl.updateKeyword);  // POST /content/:id/keywords/:kid
router.post('/:id/keywords/:kid/run',        ctrl.runKeyword);     // POST /content/:id/keywords/:kid/run
router.post('/:id/keywords/:kid/publish',    ctrl.publishKeyword); // POST /content/:id/keywords/:kid/publish

export default router;
