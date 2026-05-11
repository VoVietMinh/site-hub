import { RunOptions, RunResult } from './commandRunner';
export declare function runEE(eeArgs: string[], opts?: RunOptions): Promise<RunResult>;
export declare function runEEOrThrow(eeArgs: string[], opts?: RunOptions): Promise<RunResult>;
