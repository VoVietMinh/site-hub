import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './content.service';
import * as repo from './content.repository';

/** GET /api/content/:id/categories -- WP categories for job's site */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  try {
    const result = await service.getJobCategories(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, categories: [] });
  }
});

/** GET /api/content/:id/status -- poll job + keywords status */
export const jobStatus = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params['id']!, 10);
  const data = await service.getJobStatus(id);
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json(data);
});

/** GET /api/content/:id/check-connection -- verify WP API connectivity */
export const checkConnection = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params['id']!, 10);
  try {
    const result = await service.checkJobConnection(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});
