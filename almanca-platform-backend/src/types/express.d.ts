import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        scope: 'account' | 'profile';
        childId?: string;
      };
    }
  }
}

export {};
