import { Request, Response } from 'express';
export declare const showLogin: (req: Request, res: Response) => void;
export declare const login: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare const logout: (req: Request, res: Response) => void;
export declare const switchLocale: (req: Request, res: Response) => void;
