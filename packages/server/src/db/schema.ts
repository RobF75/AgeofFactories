import { customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; default: false; notNull: false }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authProviderId: text('auth_provider_id').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const saves = pgTable('saves', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull().default(0),
  data: bytea('data').notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
