import type { User } from '../../types';
export declare function findByUsername(username: string): Promise<User | null>;
export declare function findByEmail(email: string): Promise<User | null>;
export declare function findById(id: number): Promise<User | null>;
export declare function listAdmins(): Promise<User[]>;
export declare function listAll(): Promise<User[]>;
interface CreateParams {
    username: string;
    email: string;
    passwordHash: string;
    role?: string;
    isActive?: boolean;
}
export declare function create({ username, email, passwordHash, role, isActive }: CreateParams): Promise<User | null>;
export declare function setActive(id: number, isActive: boolean): Promise<User | null>;
export {};
