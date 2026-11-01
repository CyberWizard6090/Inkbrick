import {
  createSchemaRegistry,
  deserializeDocument,
  repairSnapshot,
  type Document,
  type DocumentSnapshot,
  type SchemaRegistry,
} from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';

import { counterBlock } from './blocks/counter';
import { SandboxError } from './i18n';

export const customBlocks = [counterBlock];

export const createSandboxSchema = (): SchemaRegistry =>
  createSchemaRegistry(customBlocks.map((block) => block.schema));

/** Реестр схем создаётся заранее: по нему документ из файла или памяти браузера проверяется до создания редактора. */
export function createSandboxEditor(
  schema: SchemaRegistry = createSandboxSchema(),
  document?: Document,
): Editor {
  const controllers = Object.fromEntries(
    customBlocks.flatMap((block) =>
      block.controller ? [[block.schema.flavour, block.controller] as const] : [],
    ),
  );

  return new Editor({ schema, document, controllers });
}

export interface ParsedDocument {
  document: Document;
  fixes: readonly string[];
}

export function parseDocument(text: string, schema: SchemaRegistry): ParsedDocument {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new SandboxError('error.notJson');
  }

  return parseSnapshot(raw, schema);
}

export function parseSnapshot(raw: unknown, schema: SchemaRegistry): ParsedDocument {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    typeof (raw as DocumentSnapshot).rootId !== 'string' ||
    typeof (raw as DocumentSnapshot).blocks !== 'object'
  ) {
    throw new SandboxError('error.notSnapshot');
  }

  const snapshot = raw as DocumentSnapshot;

  try {
    return { document: deserializeDocument(snapshot, { schema }), fixes: [] };
  } catch {
    // Снимок не прошёл проверку: пробуем восстановить, потеряв как можно меньше.
  }

  try {
    const repaired = repairSnapshot(snapshot, schema);

    return {
      document: deserializeDocument(repaired.snapshot, { schema }),
      fixes: repaired.fixes,
    };
  } catch (error) {
    throw new SandboxError(
      'error.cannotOpen',
      { reason: error instanceof Error ? error.message : String(error) },
      { cause: error },
    );
  }
}
