/** Erros de negócio. O tratador de erros os converte em Problem Details. */
export class ProblemError extends Error {
  readonly status: number;
  readonly title: string;

  constructor(status: number, title: string, detail: string) {
    super(detail);
    this.status = status;
    this.title = title;
  }
}

export class ProductNotFoundError extends ProblemError {
  constructor(id: number) {
    super(404, 'Produto não encontrado', `Produto ${id} não encontrado.`);
  }
}

export class DuplicateProductNameError extends ProblemError {
  constructor(name: string) {
    super(409, 'Nome já cadastrado', `Já existe um produto com o nome "${name}".`);
  }
}

export class StaleProductError extends ProblemError {
  constructor() {
    super(
      409,
      'Versão desatualizada',
      'O produto foi alterado por outra pessoa. Recarregue e tente de novo.',
    );
  }
}
