/** GET /api/content/:id/categories -- WP categories for job's site */
export declare const getCategories: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** GET /api/content/:id/status -- poll job + keywords status */
export declare const jobStatus: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** GET /api/content/:id/check-connection -- verify WP API connectivity */
export declare const checkConnection: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
