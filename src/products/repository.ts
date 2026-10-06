import { and, asc, count, desc, eq, ilike, ne, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { product, type ProductRow } from '../db/schema.ts';
import type { ProductSort } from './schemas.ts';

const UNIQUE_VIOLATION = '23505';

export class UniqueNameViolation extends Error {}

export interface ListOptions {
  /** Trecho do nome, sem diferenciar maiúsculas e minúsculas. */
  q?: string;
  page: number;
  size: number;
  sort: ProductSort;
}

export function createProductRepository(db: Database) {
  const sameName = (name: string) => sql`lower(${product.name}) = lower(${name})`;

  return {
    async list({ q, page, size, sort }: ListOptions) {
      const where = q?.trim() ? ilike(product.name, `%${escapeLike(q.trim())}%`) : undefined;
      const [items, [total]] = await Promise.all([
        db
          .select()
          .from(product)
          .where(where)
          .orderBy(...orderBy(sort))
          .limit(size)
          .offset(page * size),
        db.select({ value: count() }).from(product).where(where),
      ]);
      return { items, total: total?.value ?? 0 };
    },

    async findById(id: number): Promise<ProductRow | undefined> {
      const [row] = await db.select().from(product).where(eq(product.id, id));
      return row;
    },

    async nameTaken(name: string, exceptId?: number): Promise<boolean> {
      const where =
        exceptId === undefined ? sameName(name) : and(sameName(name), ne(product.id, exceptId));
      const [row] = await db.select({ id: product.id }).from(product).where(where).limit(1);
      return row !== undefined;
    },

    async insert(name: string, quantity: number): Promise<ProductRow> {
      const [row] = await uniqueName(db.insert(product).values({ name, quantity }).returning());
      return row!;
    },

    /** Altera só se a versão ainda for a esperada; devolve undefined se mudou. */
    async update(
      id: number,
      name: string,
      quantity: number,
      version: number,
    ): Promise<ProductRow | undefined> {
      const [row] = await uniqueName(
        db
          .update(product)
          .set({ name, quantity, version: sql`${product.version} + 1` })
          .where(and(eq(product.id, id), eq(product.version, version)))
          .returning(),
      );
      return row;
    },

    async delete(id: number): Promise<boolean> {
      const rows = await db.delete(product).where(eq(product.id, id)).returning({ id: product.id });
      return rows.length > 0;
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;

function orderBy(sort: ProductSort): SQL[] {
  const descending = sort.startsWith('-');
  const field = sort.replace('-', '') as 'id' | 'name' | 'quantity';
  const primary = (descending ? desc : asc)(product[field]);
  // Desempate estável para a paginação não repetir nem pular itens.
  return field === 'id' ? [primary] : [primary, asc(product.id)];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** O índice único do banco é a garantia final contra dois cadastros simultâneos. */
async function uniqueName<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (isUniqueViolation(error)) throw new UniqueNameViolation();
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
