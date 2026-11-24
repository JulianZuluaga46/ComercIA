import type { Store, User } from '@prisma/client';
import { mapStoreToApi } from './storeMapper.js';
import { decrypt } from './crypto.js';

export function mapUser(user: User & { store?: Store | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: decrypt(user.phone) || '',
    role: user.role,
    status: user.status,
    storeId: user.storeId,
    store: user.store ? mapStoreToApi(user.store) : null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}
