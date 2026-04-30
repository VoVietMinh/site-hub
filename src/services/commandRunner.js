'use strict';

/**
 * Hardened command runner.
 *
 * Security model:
 *   • Only an explicit allow-list of binaries can be executed (`ee`, `wp`,
 *     `docker`). Callers pass arguments as an *array*, never a single shell
 *     string, so there is no shell expansion / injection vector.
 *   • Each argument is validated against a conservative regex.
 *   • A timeout aborts runaway processes.
 *
 * Callers (easyengineService, wordpressService) are the only places that
 * should invoke this module — never expose it to a user-supplied command.
 */

const { spawn } = require('child_process');
const logRepo = require('../modules/logs/log.repository');

const ALLOWED_BINARIES = new Set(['ee', 'wp', 'docker']);

// One token = letters / digits / common shell-safe punctuation. We deliberately
// reject backticks, $, ;, &, |, >, <, (, ), {, }, *, ?, etc.
const SAFE_ARG_RE = /^[A-Za-z0-9_@:./=,+\-\s]*$/;

function validateArgs(args) {
  if (!Array.isArray(args)) throw new Error('args must be an array');
  for (const a of args) {
    if (typeof a !== 'string') {
      throw new Error('every arg must be a string');
    }
    if (!SAFE_ARG_RE.test(a)) {
      throw new Error(`unsafe argument rejected: ${JSON.stringify(a)}`);
    }
  }
}

/**
 * Run an allow-listed binary.
 * @param {string} binary  e.g. 'ee', 'wp', 'docker'
 * @param {string[]} args  argv after the binary
 * @param {object} [opts]  { cwd, timeoutMs, env, category }
 * @returns {Promise<{code:number, stdout:string, stderr:string, durationMs:number}>}
 */
function run(binary, args = [], opts = {}) {
  if (!ALLOWED_BINARIES.has(binary)) {
    return Promise.reject(new Error(`binary "${binary}" is not allow-listed`));
  }
  validateArgs(args);

  const {
    cwd,
    timeoutMs = 5 * 60 * 1000, // 5 min default
    env,
    category = 'command'
  } = opts;

  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      // shell:false is critical — it disables shell metacharacter expansion.
      shell: false
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logRepo
        .write({
          level: 'error',
          category,
          message: `spawn ${binary} failed`,
          meta: { args, error: err.message }
        })
        .catch(() => {});
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const result = { code, stdout, stderr, durationMs };

      logRepo
        .write({
          level: code === 0 ? 'info' : 'warn',
          category,
          message: `${binary} ${args.join(' ')} → exit ${code} (${durationMs}ms)`,
          meta: {
            stdout: stdout.slice(0, 4000),
            stderr: stderr.slice(0, 4000),
            killedByTimeout
          }
        })
        .catch(() => {});

      if (killedByTimeout) {
        return reject(
          new Error(`command timed out after ${timeoutMs}ms: ${binary} ${args.join(' ')}`)
        );
      }
      resolve(result);
    });
  });
}

/**
 * Convenience wrapper that throws on non-zero exit codes.
 */
async function runOrThrow(binary, args, opts) {
  const r = await run(binary, args, opts);
  if (r.code !== 0) {
    const err = new Error(
      `${binary} ${args.join(' ')} failed with code ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`
    );
    err.result = r;
    throw err;
  }
  return r;
}

module.exports = { run, runOrThrow, ALLOWED_BINARIES };
