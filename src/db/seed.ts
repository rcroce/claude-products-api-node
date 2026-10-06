// Produtos de exemplo para desenvolvimento: pnpm db:seed
import { loadConfig } from '../config.ts';
import { connect, runMigrations } from './client.ts';
import { product } from './schema.ts';

const { DATABASE_URL } = loadConfig();
const { db, pool } = connect(DATABASE_URL);
await runMigrations(db);
await db
  .insert(product)
  .values([
    { name: 'Mouse', quantity: 50 },
    { name: 'Teclado', quantity: 5 },
    { name: 'Monitor', quantity: 35 },
  ])
  .onConflictDoNothing();
await pool.end();
console.log('Produtos de exemplo carregados.');
