import type { ProductRow } from '../db/schema.ts';
import {
  DuplicateProductNameError,
  ProductNotFoundError,
  StaleProductError,
} from '../shared/errors.ts';
import { UniqueNameViolation, type ListOptions, type ProductRepository } from './repository.ts';
import type { Product, ProductInput, ProductPage } from './schemas.ts';

export function createProductService(repository: ProductRepository) {
  async function get(id: number): Promise<ProductRow> {
    const row = await repository.findById(id);
    if (!row) throw new ProductNotFoundError(id);
    return row;
  }

  return {
    async list(options: ListOptions): Promise<ProductPage> {
      const { items, total } = await repository.list(options);
      return {
        items: items.map(toProduct),
        page: options.page,
        size: options.size,
        totalItems: total,
        totalPages: Math.ceil(total / options.size),
      };
    },

    async get(id: number): Promise<Product> {
      return toProduct(await get(id));
    },

    async create({ name, quantity }: ProductInput): Promise<Product> {
      if (await repository.nameTaken(name)) throw new DuplicateProductNameError(name);
      return toProduct(await withNameCheck(name, () => repository.insert(name, quantity)));
    },

    /**
     * Altera o produto. Quando `version` vem preenchido, recusa a alteração se
     * outra pessoa mudou o produto depois que o cliente o leu.
     */
    async update(id: number, { name, quantity, version }: ProductInput): Promise<Product> {
      const current = await get(id);
      if (version !== undefined && version !== current.version) throw new StaleProductError();
      if (await repository.nameTaken(name, id)) throw new DuplicateProductNameError(name);
      const updated = await withNameCheck(name, () =>
        repository.update(id, name, quantity, current.version),
      );
      if (!updated) throw new StaleProductError();
      return toProduct(updated);
    },

    async delete(id: number): Promise<void> {
      if (!(await repository.delete(id))) throw new ProductNotFoundError(id);
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;

function toProduct({ id, name, quantity, version }: ProductRow): Product {
  return { id, name, quantity, version };
}

async function withNameCheck<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UniqueNameViolation) throw new DuplicateProductNameError(name);
    throw error;
  }
}
