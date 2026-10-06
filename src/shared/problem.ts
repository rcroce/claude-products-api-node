import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ProblemError } from './errors.ts';

export const INVALID_DATA = 'Dados inválidos';

interface FieldError {
  field: string;
  message: string;
}

/**
 * Converte erros em Problem Details (RFC 9457) com mensagens em português,
 * no mesmo formato da API Java.
 */
export function problemHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const instance = request.url.split('?')[0];

  if (error instanceof ProblemError) {
    return send(reply, error.status, error.title, error.message, instance);
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const errors = error.validation
      .map((issue) => ({
        field: fieldOf(issue.instancePath),
        message: issue.message ?? INVALID_DATA,
      }))
      .sort((a, b) => a.field.localeCompare(b.field) || a.message.localeCompare(b.message));
    return send(reply, 400, INVALID_DATA, errors[0]?.message ?? INVALID_DATA, instance, errors);
  }

  if (error.statusCode === 400 || error.statusCode === 415) {
    return send(reply, 400, INVALID_DATA, 'Corpo da requisição inválido.', instance);
  }

  if (error.statusCode === 404) {
    return send(reply, 404, 'Não encontrado', 'Recurso não encontrado.', instance);
  }

  request.log.error(error);
  return send(reply, 500, 'Erro interno', 'Ocorreu um erro inesperado.', instance);
}

function fieldOf(instancePath: string): string {
  return instancePath.replace(/^\//, '').replaceAll('/', '.') || 'body';
}

function send(
  reply: FastifyReply,
  status: number,
  title: string,
  detail: string,
  instance: string | undefined,
  errors?: FieldError[],
) {
  return reply
    .code(status)
    .type('application/problem+json')
    .send({ type: 'about:blank', title, status, detail, instance, ...(errors ? { errors } : {}) });
}
