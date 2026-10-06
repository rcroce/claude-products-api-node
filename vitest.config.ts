import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sobe um Postgres em container; a primeira execução baixa a imagem.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
