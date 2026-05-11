export interface SitePage {
    slug: string;
    title: string;
    menuTitle: string;
    content: string;
}
export interface SiteTemplate {
    theme: string;
    plugins: string[];
    options: Record<string, string>;
    menuName: string;
    pages: SitePage[];
}
export declare const FILE: string;
export declare const DEFAULT: Readonly<SiteTemplate>;
export declare function load(): SiteTemplate;
export declare function save(tpl: SiteTemplate): SiteTemplate;
export declare function applyTemplate(str: string, vars: Record<string, string>): string;
