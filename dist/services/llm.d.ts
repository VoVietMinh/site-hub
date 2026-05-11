interface GenerateOptions {
    json?: boolean;
    jsonSchema?: Record<string, unknown>;
}
export declare function stripFences(s: unknown): string;
export declare function generate(prompt: string, opts?: GenerateOptions): Promise<unknown>;
export {};
