/** GET /api/articles/:id/status -- poll build status */
export declare const status: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** POST /api/articles/keywords -- generate keyword articles from a topic */
export declare const generateKeywords: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** POST /api/articles/:id/build -- trigger build pipeline */
export declare const build: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** POST /api/articles/:id/retry -- retry a FAILED article */
export declare const retry: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** POST /api/articles/:id/publish -- manually publish a READY article */
export declare const publish: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** POST /api/articles/:id/update -- update article fields */
export declare const update: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/** GET /api/articles/sites/:siteId/categories -- WP category list for dropdown */
export declare const siteCategories: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
