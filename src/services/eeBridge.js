'use strict';

/**
 * SSH-aware bridge for EasyEngine + WP-CLI commands.
 *
 * When EE_OVER_SSH=true, every `ee …` invocation is rewritten as
 *   ssh -i <key> -o StrictHostKeyChecking=accept-new
 *       -o UserKnownHostsFile=/tmp/ee_known_hosts
 *       <user>@<host>  ee  <args…>
 *
 * Otherwise it's invoked locally (i.e. the binary must exist inside the
 * container — useful for dev on a machine that has EE installed natively).
 *
 * The shape stays compatible with `commandRunner.run / runOrThrow` so callers
 * just swap `run(EE, args)` for `runEE(args)` and get SSH semantics for free.
 */

const { run, runOrThrow } = require('./commandRunner');
const config = require('../config');

const SSH_OPTS = [
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'UserKnownHostsFile=/tmp/ee_known_hosts',
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10'
];

function buildArgs(eeArgs) {
  if (!Array.isArray(eeArgs)) {
    throw new Error('eeArgs must be an array');
  }
  if (config.easyEngine.ssh.enabled) {
    // The host's authorized_keys uses `command="/usr/local/bin/ee ..."` to
    // restrict this key to ee invocations only. SSH passes our args as
    // $SSH_ORIGINAL_COMMAND, which the wrapper appends. So we send only the
    // ee subcommand args — the leading `ee` binary is implied on the host.
    return {
      binary: 'ssh',
      args: [
        '-i', config.easyEngine.ssh.keyPath,
        ...SSH_OPTS,
        `${config.easyEngine.ssh.user}@${config.easyEngine.ssh.host}`,
        ...eeArgs
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
