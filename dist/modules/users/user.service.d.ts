import type { User } from '../../types';
export declare function authenticate({ username, password }: {
    username: string;
    password: string;
}): Promise<User | null>;
export declare function createAdmin({ username, email, password }: {
    username: string;
    email: string;
    password: string;
}): Promise<User>;
export declare function listAdmins(): Promise<User[]>;
export declare function setActive(id: number, isActive: boolean): Promise<User | null>;
