import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export type Database = NodePgDatabase;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
}

export function connect(url: string): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return { db: drizzle({ client: pool, casing: 'snake_case' }), pool };
}

/** Aplica as migrações versionadas da pasta drizzle/ (equivalente ao Flyway). */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
}
