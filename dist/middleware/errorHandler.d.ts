import { Request, Response, NextFunction } from 'express';
export declare function notFound(req: Request, res: Response): void;
export declare function errorHandler(err: Error & {
    status?: number;
}, req: Request, res: Response, _next: NextFunction): void;
