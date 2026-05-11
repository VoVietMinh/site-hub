import crypto from 'crypto';

export function generate(length = 20): string {
  const raw = crypto.randomBytes(24).toString('base64').replace(/[\/+=]/g, '');
  return raw.slice(0, length);
}
