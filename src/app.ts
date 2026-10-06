import { readFile } from 'node:fs/promises';
import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { createProductRepository } from './products/repository.ts';
import { productRoutes } from './products/routes.ts';
import { createProductService } from './products/service.ts';
import { problemHandler } from './shared/problem.ts';

export interface AppOptions {
  db: Database;
  corsAllowedOrigins: string[];
  logger?: FastifyServerOptions['logger'];
}

const contract = readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');

export async function buildApp({ db, corsAllowedOrigins, logger = false }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(problemHandler);
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: 'Não encontrado',
        status: 404,
        detail: 'Recurso não encontrado.',
        instance: request.url.split('?')[0],
      }),
  );

  await app.register(cors, {
    origin: corsAllowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    exposedHeaders: ['Location'],
  });

  const service = createProductService(createProductRepository(db));
  await app.register(productRoutes, { prefix: '/api/v1/products', service });

  // Health checks para a nuvem: vivo (processo) e pronto (banco respondendo).
  app.get('/health/liveness', () => ({ status: 'UP' }));
  app.get('/health/readiness', async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'UP' };
    } catch {
      return reply.code(503).send({ status: 'DOWN' });
    }
  });

  app.get('/openapi.yaml', async (_request, reply) =>
    reply.type('application/yaml').send(await contract),
  );

  return app;
}
