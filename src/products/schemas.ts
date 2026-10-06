import { z } from 'zod';
import { NAME_MAX_LENGTH, QUANTITY_MAX } from '../db/schema.ts';

/** Mesmas regras e mensagens do schema zod do frontend e da API Java. */
export const productInputSchema = z.object({
  name: z
    .string({ error: 'Nome é obrigatório.' })
    .trim()
    .min(1, 'Nome é obrigatório.')
    .max(NAME_MAX_LENGTH, `Nome deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`),
  quantity: z
    .number({
      error: (issue) =>
        issue.input == null
          ? 'Quantidade é obrigatória.'
          : 'Quantidade deve ser um número inteiro.',
    })
    .int('Quantidade deve ser um número inteiro.')
    .min(0, 'Quantidade deve ser 0 ou maior.')
    .max(QUANTITY_MAX, `Quantidade deve ser no máximo ${QUANTITY_MAX}.`),
  /** Só usado na alteração: recusa com 409 se o produto mudou desde a leitura. */
  version: z
    .number({ error: 'Versão inválida.' })
    .int('Versão inválida.')
    .min(0, 'Versão inválida.')
    .optional(),
});

export const productSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  quantity: z.number().int(),
  version: z.number().int(),
});

export const productPageSchema = z.object({
  items: z.array(productSchema),
  page: z.number().int(),
  size: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});

const SORTS = ['id', '-id', 'name', '-name', 'quantity', '-quantity'] as const;
const pageSizeMessage = 'Tamanho da página deve ser entre 1 e 100.';

export const listQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce
    .number({ error: 'Valor inválido para page.' })
    .int('Valor inválido para page.')
    .min(0, 'Página deve ser 0 ou maior.')
    .default(0),
  size: z.coerce
    .number({ error: 'Valor inválido para size.' })
    .int('Valor inválido para size.')
    .min(1, pageSizeMessage)
    .max(100, pageSizeMessage)
    .default(20),
  sort: z
    .enum(SORTS, {
      error: 'Ordenação inválida. Use id, name ou quantity, com - para ordem decrescente.',
    })
    .default('name'),
});

export const idParamsSchema = z.object({
  id: z.coerce.number({ error: 'Valor inválido para id.' }).int('Valor inválido para id.'),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductPage = z.infer<typeof productPageSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type ProductSort = ListQuery['sort'];
