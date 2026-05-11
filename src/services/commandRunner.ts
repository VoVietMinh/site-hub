import { spawn } from 'child_process';
import * as logRepo from '../modules/logs/log.repository';

export const ALLOWED_BINARIES = new Set(['ee', 'wp', 'docker', 'ssh']);
const MAX_ARG_LEN = 65536;

function validateArgs(args: string[]): void {
  if (!Array.isArray(args)) throw new Error('args must be an array');
  for (const a of args) {
    if (typeof a !== 'string') throw new Error('every arg must be a string');
    if (a.length > MAX_ARG_LEN) throw new Error(`arg too long (>${MAX_ARG_LEN} chars)`);
    if (a.includes('\0')) throw new Error('NULL byte in arg is not allowed');
  }
}

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

export function run(binary: string, args: string[] = [], opts: RunOptions = {}): Promise<RunResult> {
  if (!ALLOWED_BINARIES.has(binary)) {
    return Promise.reject(new Error(`binary "${binary}" is not allow-listed`));
  }
  validateArgs(args);

  const { cwd, timeoutMs = 5 * 60 * 1000, env, category = 'command' } = opts;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      logRepo.write({ level: 'error', category, message: `spawn ${binary} failed`, meta: { args, error: err.message } }).catch(() => {});
      reject(err);
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const result: RunResult = { code, stdout, stderr, durationMs };

      logRepo.write({
        level: code === 0 ? 'info' : 'warn',
        category,
        message: `${binary} ${args.join(' ')} → exit ${code} (${durationMs}ms)`,
        meta: { stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000), killedByTimeout },
      }).catch(() => {});

      if (killedByTimeout) {
        reject(new Error(`command timed out after ${timeoutMs}ms: ${binary} ${args.join(' ')}`));
        return;
      }
      resolve(result);
    });
  });
}

export async function runOrThrow(binary: string, args: string[], opts?: RunOptions): Promise<RunResult> {
  const r = await run(binary, args, opts);
  if (r.code !== 0) {
    const err = Object.assign(
      new Error(`${binary} ${args.join(' ')} failed with code ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`),
      { result: r }
    );
    throw err;
  }
  return r;
}
