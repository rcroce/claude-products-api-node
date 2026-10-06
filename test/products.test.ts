import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { connect, runMigrations, type DatabaseHandle } from '../src/db/client.ts';
import { product } from '../src/db/schema.ts';
import { assertMatchesContract } from './contract.ts';

/**
 * Testes de ponta a ponta contra um Postgres real. Toda resposta da API é
 * conferida contra o openapi.yaml. Mesmos cenários da API Java.
 */
const PRODUCTS = '/api/v1/products';

let container: StartedPostgreSqlContainer;
let database: DatabaseHandle;
let app: FastifyInstance;
let ids: { mouse: number; keyboard: number; monitor: number };

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  database = connect(container.getConnectionUri());
  await runMigrations(database.db);
  app = await buildApp({ db: database.db, corsAllowedOrigins: ['http://localhost:5173'] });
});

afterAll(async () => {
  await app?.close();
  await database?.pool.end();
  await container?.stop();
});

beforeEach(async () => {
  await database.db.delete(product);
  const rows = await database.db
    .insert(product)
    .values([
      { name: 'Mouse', quantity: 50 },
      { name: 'Teclado', quantity: 5 },
      { name: 'Monitor', quantity: 35 },
    ])
    .returning({ id: product.id });
  ids = { mouse: rows[0]!.id, keyboard: rows[1]!.id, monitor: rows[2]!.id };
});

async function send(options: InjectOptions & { method: string; url: string }) {
  const response = await app.inject(options);
  assertMatchesContract(options.method, options.url, response);
  return response;
}

const create = (body: unknown) => send({ method: 'POST', url: PRODUCTS, payload: body as object });
const update = (id: number, body: unknown) =>
  send({ method: 'PUT', url: `${PRODUCTS}/${id}`, payload: body as object });

describe('listar', () => {
  it('devolve a primeira página ordenada por nome', async () => {
    const response = await send({ method: 'GET', url: PRODUCTS });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.map((p: { name: string }) => p.name)).toEqual([
      'Monitor',
      'Mouse',
      'Teclado',
    ]);
    expect(body).toMatchObject({ page: 0, size: 20, totalItems: 3, totalPages: 1 });
  });

  it('busca por nome sem diferenciar maiúsculas', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}?q=MO` });
    expect(response.json().items.map((p: { name: string }) => p.name)).toEqual([
      'Monitor',
      'Mouse',
    ]);
  });

  it('trata curingas do LIKE como texto', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}?q=%25` });
    expect(response.json().items).toEqual([]);
  });

  it('pagina e ordena de forma decrescente', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}?size=2&page=1&sort=-quantity` });
    const body = response.json();
    expect(body.items.map((p: { name: string }) => p.name)).toEqual(['Teclado']);
    expect(body.totalPages).toBe(2);
  });

  it('recusa tamanho de página acima do limite', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}?size=101` });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      detail: 'Tamanho da página deve ser entre 1 e 100.',
      errors: [{ field: 'size' }],
    });
  });

  it('recusa ordenação desconhecida', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}?sort=price` });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].field).toBe('sort');
  });
});

describe('ler', () => {
  it('devolve o produto', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}/${ids.monitor}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: ids.monitor, name: 'Monitor', quantity: 35, version: 0 });
  });

  it('devolve 404 quando não existe', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}/999999` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      title: 'Produto não encontrado',
      detail: 'Produto 999999 não encontrado.',
    });
  });

  it('devolve 400 para id não numérico', async () => {
    const response = await send({ method: 'GET', url: `${PRODUCTS}/abc` });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].field).toBe('id');
  });
});

describe('criar', () => {
  it('devolve 201 com corpo e Location', async () => {
    const response = await create({ name: '  Notebook  ', quantity: 10 });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ name: 'Notebook', quantity: 10, version: 0 });
    expect(response.headers.location).toMatch(new RegExp(`${PRODUCTS}/${body.id}$`));
  });

  it('recusa nome repetido sem diferenciar maiúsculas', async () => {
    const response = await create({ name: 'mouse', quantity: 1 });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      title: 'Nome já cadastrado',
      detail: 'Já existe um produto com o nome "mouse".',
    });
  });

  it('recusa nome em branco', async () => {
    const response = await create({ name: '   ', quantity: 1 });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      title: 'Dados inválidos',
      detail: 'Nome é obrigatório.',
      errors: [{ field: 'name' }],
    });
  });

  it('recusa nome com mais de 45 caracteres', async () => {
    const response = await create({ name: 'x'.repeat(46), quantity: 1 });
    expect(response.json().detail).toBe('Nome deve ter no máximo 45 caracteres.');
  });

  it('recusa quantidade negativa', async () => {
    const response = await create({ name: 'Cabo', quantity: -1 });
    expect(response.json().detail).toBe('Quantidade deve ser 0 ou maior.');
  });

  it('recusa quantidade acima do máximo', async () => {
    const response = await create({ name: 'Cabo', quantity: 1_000_000_000 });
    expect(response.json().detail).toBe('Quantidade deve ser no máximo 999999999.');
  });

  it('recusa quantidade fracionária', async () => {
    const response = await create({ name: 'Cabo', quantity: 1.5 });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      detail: 'Quantidade deve ser um número inteiro.',
      errors: [{ field: 'quantity' }],
    });
  });

  it('informa todos os campos inválidos', async () => {
    const response = await create({ name: null, quantity: null });
    expect(response.json().errors.map((e: { field: string }) => e.field)).toEqual([
      'name',
      'quantity',
    ]);
    expect(response.json().errors[1].message).toBe('Quantidade é obrigatória.');
  });

  it('recusa JSON malformado', async () => {
    const response = await send({
      method: 'POST',
      url: PRODUCTS,
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toBe('Corpo da requisição inválido.');
  });
});

describe('alterar', () => {
  it('altera e incrementa a versão', async () => {
    const response = await update(ids.mouse, { name: 'Mouse sem fio', quantity: 80 });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: ids.mouse,
      name: 'Mouse sem fio',
      quantity: 80,
      version: 1,
    });
  });

  it('permite mudar só maiúsculas do próprio nome', async () => {
    const response = await update(ids.mouse, { name: 'MOUSE', quantity: 50 });
    expect(response.statusCode).toBe(200);
  });

  it('aceita a versão atual', async () => {
    const response = await update(ids.mouse, { name: 'Mouse', quantity: 60, version: 0 });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(1);
  });

  it('recusa versão desatualizada', async () => {
    await update(ids.mouse, { name: 'Mouse', quantity: 60 });
    const response = await update(ids.mouse, { name: 'Mouse', quantity: 70, version: 0 });
    expect(response.statusCode).toBe(409);
    expect(response.json().title).toBe('Versão desatualizada');
  });

  it('recusa o nome de outro produto', async () => {
    const response = await update(ids.mouse, { name: 'teclado', quantity: 1 });
    expect(response.statusCode).toBe(409);
  });

  it('devolve 404 quando não existe', async () => {
    const response = await update(999999, { name: 'X', quantity: 1 });
    expect(response.statusCode).toBe(404);
  });

  it('recusa dados inválidos', async () => {
    const response = await update(ids.mouse, { name: 'Mouse', quantity: -1 });
    expect(response.statusCode).toBe(400);
  });
});

describe('excluir', () => {
  it('devolve 204 e remove', async () => {
    const removed = await send({ method: 'DELETE', url: `${PRODUCTS}/${ids.keyboard}` });
    expect(removed.statusCode).toBe(204);
    const after = await send({ method: 'GET', url: `${PRODUCTS}/${ids.keyboard}` });
    expect(after.statusCode).toBe(404);
  });

  it('devolve 404 quando não existe', async () => {
    const response = await send({ method: 'DELETE', url: `${PRODUCTS}/999999` });
    expect(response.statusCode).toBe(404);
  });
});

describe('CORS', () => {
  it('libera a origem configurada', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: PRODUCTS,
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('expõe o cabeçalho Location', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PRODUCTS,
      headers: { origin: 'http://localhost:5173' },
      payload: { name: 'Cabo', quantity: 1 },
    });
    expect(response.headers['access-control-expose-headers']).toBe('Location');
  });

  it('não libera origem desconhecida', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: PRODUCTS,
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'DELETE' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('operação', () => {
  it('responde aos health checks', async () => {
    expect((await app.inject({ method: 'GET', url: '/health/liveness' })).json()).toEqual({
      status: 'UP',
    });
    expect((await app.inject({ method: 'GET', url: '/health/readiness' })).json()).toEqual({
      status: 'UP',
    });
  });

  it('serve o contrato', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.yaml' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('openapi: 3.0.3');
  });
});

describe('banco', () => {
  it('garante nome único mesmo sem passar pela API', async () => {
    await expect(
      database.db.insert(product).values({ name: 'MOUSE', quantity: 1 }),
    ).rejects.toThrow();
  });

  it('garante a faixa de quantidade', async () => {
    await expect(
      database.db.insert(product).values({ name: 'Cabo', quantity: -1 }),
    ).rejects.toThrow();
  });

  it('garante nome não vazio', async () => {
    await expect(
      database.db.insert(product).values({ name: '   ', quantity: 1 }),
    ).rejects.toThrow();
  });
});
