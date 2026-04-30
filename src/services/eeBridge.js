'use strict';

/**
 * SSH-aware bridge for EasyEngine + WP-CLI commands.
 *
 * SSH transport semantics (the part that bites people):
 *   `ssh user@host argv1 argv2 argv3`
 *      → ssh joins argv1..N with single spaces into one command string
 *      → that string is delivered to the remote sshd
 *      → sshd hands it to the user's login shell, which parses it again
 *
 * That second parse means we MUST single-quote every argument on the client
 * side and pass the whole thing as ONE argv to ssh. Otherwise an arg like
 *   --title=site title example.com
 * would be re-split into three positional arguments on the host.
 *
 * Pair this with an `authorized_keys` `command="eval ..."` wrapper on the
 * host (see README) so the remote shell respects the quoting we send.
 */

const { run, runOrThrow } = require('./commandRunner');
const config = require('../config');

const SSH_OPTS = [
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'UserKnownHostsFile=/tmp/ee_known_hosts',
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10'
];

/**
 * POSIX-safe single-quote shell escape. Anything alphanumeric or made up of
 * common URL/CLI punctuation is left bare; everything else is wrapped in
 * single quotes with embedded `'` rewritten as `'\''`.
 */
function shellQuote(arg) {
  const s = String(arg);
  if (s === '') return "''";
  if (/^[A-Za-z0-9_./:=,\-+@]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildArgs(eeArgs) {
  if (!Array.isArray(eeArgs)) {
    throw new Error('eeArgs must be an array');
  }

  if (config.easyEngine.ssh.enabled) {
    // Pre-quote every ee arg, join into a single command string, and hand
    // that string to ssh as ONE argv. ssh will deliver it byte-for-byte to
    // the remote `command="eval ..."` wrapper, which re-parses it with full
    // POSIX quoting honoured.
    const remoteCommand = eeArgs.map(shellQuote).join(' ');
    return {
      binary: 'ssh',
      args: [
        '-i', config.easyEngine.ssh.keyPath,
        ...SSH_OPTS,
        `${config.easyEngine.ssh.user}@${config.easyEngine.ssh.host}`,
        remoteCommand
      ]
    };
  }

  return { binary: config.easyEngine.binary, args: eeArgs };
}

async function runEE(eeArgs, opts = {}) {
  const { binary, args } = buildArgs(eeArgs);
  return run(binary, args, opts);
}

async function runEEOrThrow(eeArgs, opts = {}) {
  const { binary, args } = buildArgs(eeArgs);
  return runOrThrow(binary, args, opts);
}

module.exports = { runEE, runEEOrThrow };
