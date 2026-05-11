import { query, queryOne, execute } from '../../infrastructure/db/connection';
import type { User } from '../../types';

export async function findByUsername(username: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE username = $1', [username]);
}

export async function findByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
}

export async function findById(id: number): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function listAdmins(): Promise<User[]> {
  return query<User>(
    "SELECT id, username, email, role, is_active, created_at, updated_at FROM users WHERE role = 'ADMIN' ORDER BY created_at DESC"
  );
}

export async function listAll(): Promise<User[]> {
  return query<User>(
    "SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY role DESC, created_at DESC"
  );
}

interface CreateParams {
  username: string;
  email: string;
  passwordHash: string;
  role?: string;
  isActive?: boolean;
}

export async function create({ username, email, passwordHash, role = 'ADMIN', isActive = true }: CreateParams): Promise<User | null> {
  return queryOne<User>(
    "INSERT INTO users (username, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [username, email, passwordHash, role, isActive]
  );
}

export async function setActive(id: number, isActive: boolean): Promise<User | null> {
  await execute(
    "UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role = 'ADMIN'",
    [isActive, id]
  );
  return findById(id);
}
