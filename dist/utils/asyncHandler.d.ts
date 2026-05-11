import { Request, Response, NextFunction, RequestHandler } from 'express';
type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export declare function asyncHandler(fn: AsyncRouteHandler): RequestHandler;
export {};
