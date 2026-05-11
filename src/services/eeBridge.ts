import { run, runOrThrow, RunOptions, RunResult } from './commandRunner';
import config from '../config';

const SSH_OPTS = [
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'UserKnownHostsFile=/tmp/ee_known_hosts',
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10',
];

function shellQuote(arg: string): string {
  const s = String(arg);
  if (s === '') return "''";
  if (/^[A-Za-z0-9_./:=,\-+@]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildArgs(eeArgs: string[]): { binary: string; args: string[] } {
  if (!Array.isArray(eeArgs)) throw new Error('eeArgs must be an array');

  if (config.easyEngine.ssh.enabled) {
    const remoteCommand = eeArgs.map(shellQuote).join(' ');
    return {
      binary: 'ssh',
      args: [
        '-i', config.easyEngine.ssh.keyPath,
        ...SSH_OPTS,
        `${config.easyEngine.ssh.user}@${config.easyEngine.ssh.host}`,
        remoteCommand,
      ],
    };
  }
  return { binary: config.easyEngine.binary, args: eeArgs };
}

export async function runEE(eeArgs: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { binary, args } = buildArgs(eeArgs);
  return run(binary, args, opts);
}

export async function runEEOrThrow(eeArgs: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { binary, args } = buildArgs(eeArgs);
  return runOrThrow(binary, args, opts);
}
