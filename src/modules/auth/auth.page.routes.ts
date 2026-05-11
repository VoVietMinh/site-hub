import { Router } from 'express';
import * as ctrl from './auth.page.controller';

const router = Router();

// Page routes -- auth forms and redirects
router.get('/login',          ctrl.showLogin);   // GET  /auth/login
router.post('/login',         ctrl.login);        // POST /auth/login
router.post('/logout',        ctrl.logout);       // POST /auth/logout
router.get('/lang/:locale',   ctrl.switchLocale); // GET  /auth/lang/:locale

export default router;
