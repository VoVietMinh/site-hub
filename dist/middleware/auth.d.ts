import { Request, Response, NextFunction, RequestHandler } from 'express';
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): RequestHandler;
