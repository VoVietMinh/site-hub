import bcrypt from 'bcryptjs';
import * as repo from './user.repository';
import * as v from '../../utils/validators';
import type { User } from '../../types';

export async function authenticate({ username, password }: { username: string; password: string }): Promise<User | null> {
  if (!v.isValidUsername(username) || !v.isStrongPassword(password)) return null;
  const u = await repo.findByUsername(username);
  if (!u || !u.is_active) return null;
  const ok = await bcrypt.compare(password, u.password_hash as string);
  if (!ok) return null;
  return u;
}

export async function createAdmin({ username, email, password }: { username: string; email: string; password: string }): Promise<User> {
  if (!v.isValidUsername(username)) throw Object.assign(new Error('invalid username'), { status: 400 });
  if (!v.isValidEmail(email))       throw Object.assign(new Error('invalid email'),    { status: 400 });
  if (!v.isStrongPassword(password)) throw Object.assign(new Error('password must be 8-128 chars'), { status: 400 });
  if (await repo.findByUsername(username)) throw Object.assign(new Error('username already exists'), { status: 409 });
  if (await repo.findByEmail(email))       throw Object.assign(new Error('email already exists'),    { status: 409 });
  const hash = await bcrypt.hash(password, 10);
  const user = await repo.create({ username, email, passwordHash: hash, role: 'ADMIN', isActive: true });
  if (!user) throw new Error('Failed to create user');
  return user;
}

export async function listAdmins(): Promise<User[]> {
  return repo.listAdmins();
}

export async function setActive(id: number, isActive: boolean): Promise<User | null> {
  return repo.setActive(id, isActive);
}
