import { gzipSync, gunzipSync } from 'node:zlib';
import { and, eq } from 'drizzle-orm';
import type { WorldState } from '@aof/shared';
import { db } from './client.js';
import { saves } from './schema.js';

const SLOT = 0;

export async function loadSave(
  userId: string,
): Promise<{ state: WorldState; updatedAt: number } | null> {
  const rows = await db
    .select()
    .from(saves)
    .where(and(eq(saves.userId, userId), eq(saves.slot, SLOT)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const json = gunzipSync(row.data).toString('utf-8');
  return {
    state: JSON.parse(json) as WorldState,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function upsertSave(userId: string, state: WorldState): Promise<Date> {
  const data = gzipSync(Buffer.from(JSON.stringify(state), 'utf-8'));
  const updatedAt = new Date();
  const existing = await db
    .select({ id: saves.id })
    .from(saves)
    .where(and(eq(saves.userId, userId), eq(saves.slot, SLOT)))
    .limit(1);
  if (existing[0]) {
    await db.update(saves).set({ data, updatedAt }).where(eq(saves.id, existing[0].id));
  } else {
    await db.insert(saves).values({ userId, slot: SLOT, data, updatedAt });
  }
  return updatedAt;
}
