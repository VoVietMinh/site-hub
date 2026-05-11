import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as ctrl from './site.page.controller';

const router = Router();
router.use(requireAuth);

// Page routes -- site management
router.get('/',                   ctrl.index);             // GET  /sites
router.get('/new',                ctrl.showCreate);        // GET  /sites/new
router.post('/',                  ctrl.create);            // POST /sites
router.get('/:domain',            ctrl.detail);            // GET  /sites/:domain
router.post('/:domain/credentials', ctrl.updateCredentials); // POST /sites/:domain/credentials
router.delete('/:domain',         ctrl.destroy);           // DELETE /sites/:domain
router.post('/:domain/delete',    ctrl.destroy);           // POST /sites/:domain/delete (method-override)

export default router;
