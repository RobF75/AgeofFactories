import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { users } from './schema.js';
import type { AuthenticatedUser } from '../auth/types.js';

export async function findOrCreateUser(input: AuthenticatedUser) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.authProviderId, input.authProviderId))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(users)
    .values({
      authProviderId: input.authProviderId,
      email: input.email,
      displayName: input.displayName,
    })
    .returning();
  if (!created) throw new Error('insert returned no row');
  return created;
}
