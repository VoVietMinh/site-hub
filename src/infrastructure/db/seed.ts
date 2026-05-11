import bcrypt from 'bcryptjs';
import { queryOne } from './connection';
import config from '../../config';

export async function seed(): Promise<void> {
  const existing = await queryOne(
    "SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1"
  );
  if (existing) return;

  const hash = await bcrypt.hash(config.superAdmin.password, 10);
  await queryOne(
    `INSERT INTO users (username, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'SUPER_ADMIN', TRUE)
     ON CONFLICT (username) DO NOTHING
     RETURNING *`,
    [config.superAdmin.username, config.superAdmin.email, hash]
  );

  console.log('Seeded SUPER_ADMIN:', config.superAdmin.username);
}

if (require.main === module) {
  seed()
    .then(() => { console.log('Seed complete.'); process.exit(0); })
    .catch((err: unknown) => {
      console.error('Seed failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
