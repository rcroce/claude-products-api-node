import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const NAME_MAX_LENGTH = 45;
export const QUANTITY_MAX = 999_999_999;

export const product = pgTable(
  'product',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: NAME_MAX_LENGTH }).notNull(),
    quantity: integer().notNull().default(0),
    version: bigint({ mode: 'number' }).notNull().default(0),
  },
  (table) => [
    check('product_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check(
      'product_quantity_range',
      sql`${table.quantity} between 0 and ${sql.raw(String(QUANTITY_MAX))}`,
    ),
    // Nome único sem diferenciar maiúsculas e minúsculas.
    uniqueIndex('product_name_unique').on(sql`lower(${table.name})`),
  ],
);

export type ProductRow = typeof product.$inferSelect;
