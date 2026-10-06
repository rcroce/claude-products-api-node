import { readFile } from 'node:fs/promises';
import { dereference } from '@readme/openapi-parser';
import { Ajv } from 'ajv';
import addFormatsPlugin from 'ajv-formats';
import type { Response } from 'light-my-request';
import { parse } from 'yaml';

type Schema = Record<string, unknown>;
interface Operation {
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
}
interface Spec {
  paths: Record<string, Record<string, Operation>>;
}

const BASE = '/api/v1';
const spec = (await dereference(
  parse(await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8')),
)) as unknown as Spec;

const ajv = new Ajv({ strict: false, allErrors: true });
(addFormatsPlugin as unknown as (ajv: Ajv) => void)(ajv);
ajv.addFormat('int32', { type: 'number', validate: (n: number) => Number.isInteger(n) });
ajv.addFormat('int64', { type: 'number', validate: (n: number) => Number.isInteger(n) });

const templates = Object.keys(spec.paths).map((template) => ({
  template,
  pattern: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
}));

/**
 * Confere uma resposta contra o openapi.yaml: o status precisa estar
 * documentado e o corpo precisa seguir o schema do content type devolvido.
 */
export function assertMatchesContract(method: string, url: string, response: Response): void {
  const path = url.split('?')[0]!.replace(BASE, '');
  const match = templates.find(({ pattern }) => pattern.test(path));
  if (!match) throw new Error(`Rota ${path} não está no contrato.`);
  const operation = spec.paths[match.template]![method.toLowerCase()];
  if (!operation) throw new Error(`${method} ${match.template} não está no contrato.`);
  const documented = operation.responses[String(response.statusCode)];
  if (!documented) {
    throw new Error(
      `Status ${response.statusCode} não documentado para ${method} ${match.template}.`,
    );
  }
  if (!documented.content) {
    if (response.body !== '') throw new Error(`${method} ${match.template} não deveria ter corpo.`);
    return;
  }
  const contentType = String(response.headers['content-type'] ?? '').split(';')[0]!;
  const media = documented.content[contentType];
  if (!media) {
    throw new Error(`Content type ${contentType} não documentado para ${response.statusCode}.`);
  }
  const validate = ajv.compile(media.schema);
  if (!validate(response.json())) {
    throw new Error(`Resposta fora do contrato: ${ajv.errorsText(validate.errors)}`);
  }
}
