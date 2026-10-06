import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { connect, runMigrations } from './db/client.ts';

const config = loadConfig();
const { db, pool } = connect(config.DATABASE_URL);
await runMigrations(db);

const app = await buildApp({
  db,
  corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
  logger: { level: config.LOG_LEVEL },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
