# API de produtos (Node.js)

API REST de produtos em Node.js, segunda implementação do contrato v1 da [API Java](https://github.com/rcroce/claude-products-api-java). É consumida pelos apps web e mobile de [rcroce/claude-products-app-web](https://github.com/rcroce/claude-products-app-web).

As duas APIs atendem o mesmo [`openapi.yaml`](openapi.yaml) (cópia idêntica do arquivo da API Java), então o frontend troca de uma para a outra só mudando a URL.

## Stack

| Camada         | Escolha                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| Runtime        | Node.js 24 (LTS), TypeScript executado direto pelo Node, sem build                       |
| Framework      | Fastify 5 com validação e serialização por zod                                           |
| Banco          | PostgreSQL 18 com Drizzle ORM; migrações versionadas em `drizzle/`                       |
| Testes         | Vitest, Testcontainers (Postgres real) e validação das respostas contra o `openapi.yaml` |
| Qualidade e CI | ESLint, Prettier, `tsc` estrito, GitHub Actions, CodeQL, Dependabot                      |

## Requisitos

- Node.js 24 (`.nvmrc`) e pnpm 10 (`corepack enable`)
- Docker (Postgres de desenvolvimento e dos testes)

## Como rodar

```bash
pnpm install
docker compose up -d          # Postgres local
cp .env.example .env
pnpm db:seed                  # aplica as migrações e carrega 3 produtos de exemplo
pnpm dev                      # http://localhost:8080/api/v1/products
```

A API aplica as migrações sozinha ao subir. O contrato fica em http://localhost:8080/openapi.yaml.

| Comando                                              | O que faz                                        |
| ---------------------------------------------------- | ------------------------------------------------ |
| `pnpm test`                                          | Testes com Postgres em container                 |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Checagens do CI                                  |
| `pnpm db:generate --name <nome>`                     | Gera uma migração a partir de `src/db/schema.ts` |

## Configuração

| Variável               | Para quê                                                           | Padrão                                                          |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`         | Conexão com o Postgres                                             | obrigatória                                                     |
| `PORT`, `HOST`         | Onde a API escuta                                                  | `8080`, `0.0.0.0`                                               |
| `CORS_ALLOWED_ORIGINS` | Origens do navegador que podem chamar a API, separadas por vírgula | `http://localhost:5173,http://localhost:8081` (Vite e Expo web) |
| `LOG_LEVEL`            | Nível dos logs JSON (pino)                                         | `info`                                                          |

Health checks para a nuvem: `/health/liveness` e `/health/readiness` (este confere o banco).

## Contrato v1

Igual ao da [API Java](https://github.com/rcroce/claude-products-api-java#contrato-v1): base `/api/v1`, paginação com `q`, `page`, `size` e `sort`, `version` opcional no `PUT` para evitar sobrescrever alterações de outra pessoa, e erros em Problem Details (RFC 9457) com as mesmas mensagens em português.

Para mudar o contrato, altere primeiro o `openapi.yaml` da API Java e copie o arquivo para cá; os testes das duas APIs falham se a resposta não seguir o arquivo.

## Organização

```
src/
├── app.ts               monta o Fastify (rotas, CORS, erros, health)
├── server.ts            lê o ambiente, migra o banco e sobe o servidor
├── config.ts            variáveis de ambiente validadas com zod
├── db/                  schema Drizzle, conexão, migrações e seed
├── products/            schemas, rotas, serviço e repositório
└── shared/              erros de negócio e Problem Details
```

## Próximas etapas

1. Integração com o frontend (`packages/core` apontando para `/api/v1`).
2. Login: validação do JWT do provedor OIDC com `jose`, mais helmet e rate limit.
3. Publicação: imagem Docker e Postgres gerenciado na nuvem.
