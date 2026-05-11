export declare const ALLOWED_BINARIES: Set<string>;
export interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
}
export interface RunOptions {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    category?: string;
}
export declare function run(binary: string, args?: string[], opts?: RunOptions): Promise<RunResult>;
export declare function runOrThrow(binary: string, args: string[], opts?: RunOptions): Promise<RunResult>;
