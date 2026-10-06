import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ProductService } from './service.ts';
import {
  idParamsSchema,
  listQuerySchema,
  productInputSchema,
  productPageSchema,
  productSchema,
} from './schemas.ts';

export const productRoutes: FastifyPluginAsyncZod<{ service: ProductService }> = async (
  app,
  { service },
) => {
  app.get(
    '/',
    { schema: { querystring: listQuerySchema, response: { 200: productPageSchema } } },
    (request) => service.list(request.query),
  );

  app.get(
    '/:id',
    { schema: { params: idParamsSchema, response: { 200: productSchema } } },
    (request) => service.get(request.params.id),
  );

  app.post(
    '/',
    { schema: { body: productInputSchema, response: { 201: productSchema } } },
    async (request, reply) => {
      const created = await service.create(request.body);
      const location = `${request.protocol}://${request.host}${request.url.split('?')[0]}/${created.id}`;
      return reply.code(201).header('location', location).send(created);
    },
  );

  app.put(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: productInputSchema,
        response: { 200: productSchema },
      },
    },
    (request) => service.update(request.params.id, request.body),
  );

  app.delete(
    '/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await service.delete(request.params.id);
      return reply.code(204).send(null);
    },
  );
};
