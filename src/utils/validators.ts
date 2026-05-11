const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

export function isValidDomain(d: unknown): d is string {
  return typeof d === 'string' && DOMAIN_RE.test(d);
}

export function assertDomain(d: unknown): string {
  if (!isValidDomain(d)) {
    const err = Object.assign(new Error('invalid domain'), { status: 400 });
    throw err;
  }
  return d;
}

export function isNonEmptyString(s: unknown, max = 1000): s is string {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= max;
}

export function isPositiveInt(n: unknown, max = 1000): boolean {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 && v <= max;
}

const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,32}$/;
export function isValidUsername(u: unknown): u is string {
  return typeof u === 'string' && USERNAME_RE.test(u);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(e: unknown): e is string {
  return typeof e === 'string' && EMAIL_RE.test(e) && e.length <= 254;
}

export function isStrongPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 128;
}
