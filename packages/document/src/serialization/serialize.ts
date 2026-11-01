import { Document } from '../document';
import type { BaseBlock, DocumentSnapshot } from '../model';
import type { SchemaRegistry } from '../schema';

/**
 * Снимок документа в виде обычного JSON: никаких компонентов, стилей и функций.
 * С реестром схем в снимок попадают версии схем (`schemaVersions`) — по ним при загрузке запускаются миграции.
 */
export function serializeDocument(document: Document, schema?: SchemaRegistry): DocumentSnapshot {
  const blocks = document.dump();
  const snapshot: DocumentSnapshot = JSON.parse(
    JSON.stringify({ rootId: document.rootId, blocks }),
  );

  if (schema) {
    const versions: Record<string, number> = {};

    for (const { flavour } of Object.values(blocks)) {
      if (schema.hasBlock(flavour)) versions[flavour] = schema.getVersion(flavour);
    }

    snapshot.schemaVersions = versions;
  }

  return snapshot;
}

export class DocumentValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid document:\n- ${issues.join('\n- ')}`);
    this.name = 'DocumentValidationError';
  }
}

export interface DeserializeOptions {
  schema: SchemaRegistry;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Возвращает копию снимка, где props блоков, сохранённых устаревшей версией схемы, приведены к текущей
 * (`BlockSchema.migrate`). Блоки без версии считаются версией 1; блоки новее реестра не трогаются —
 * их отклонит `validateSnapshot`. Исключение миграции превращается в `DocumentValidationError`.
 */
export function migrateSnapshot(
  snapshot: DocumentSnapshot,
  schema: SchemaRegistry,
): DocumentSnapshot {
  if (!isPlainObject(snapshot) || !isPlainObject(snapshot.blocks)) return snapshot;

  const stored = isPlainObject(snapshot.schemaVersions) ? snapshot.schemaVersions : {};
  const versions: Record<string, number> = { ...stored };
  const blocks: Record<string, BaseBlock> = {};

  for (const [id, raw] of Object.entries(snapshot.blocks)) {
    let block = raw as BaseBlock;

    if (isPlainObject(raw) && typeof block.flavour === 'string' && schema.hasBlock(block.flavour)) {
      const current = schema.getVersion(block.flavour);
      const from = typeof stored[block.flavour] === 'number' ? stored[block.flavour] : 1;

      if (from < current && isPlainObject(block.props)) {
        try {
          block = { ...block, props: schema.migrateProps(block.flavour, block.props, from) };
        } catch (error) {
          throw new DocumentValidationError([
            `block "${id}" (${block.flavour}): migration from version ${from} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ]);
        }
      }

      versions[block.flavour] = Math.max(from, current);
    }

    blocks[id] = block;
  }

  return { ...snapshot, blocks, schemaVersions: versions };
}

/**
 * Проверяет целостность дерева и props известных блоков.
 * Блоки с незарегистрированным flavour НЕ считаются ошибкой: они сохраняются как есть,
 * чтобы документ не терял данные только из-за отсутствия схемы/компонента.
 */
export function validateSnapshot(snapshot: DocumentSnapshot, schema: SchemaRegistry): string[] {
  const issues: string[] = [];
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  // Снимок приходит извне (сервер, файл): сначала проверяем форму, чтобы не упасть на чтении полей.
  if (!isObject(snapshot) || typeof snapshot.rootId !== 'string' || !isObject(snapshot.blocks)) {
    return ['snapshot must be an object with a string "rootId" and an object "blocks"'];
  }

  const blocks = snapshot.blocks as Record<string, unknown>;
  const root = blocks[snapshot.rootId];

  if (!isObject(root)) {
    issues.push(`root block "${snapshot.rootId}" is missing`);
    return issues;
  }

  if (root.parentId !== null)
    issues.push(`root block "${snapshot.rootId}" must have parentId null`);

  for (const [id, raw] of Object.entries(blocks)) {
    if (!isObject(raw)) {
      issues.push(`block "${id}" is not an object`);
      continue;
    }

    const block = raw as unknown as BaseBlock;

    if (block.id !== id)
      issues.push(`block key "${id}" does not match its id "${String(block.id)}"`);
    if (typeof block.flavour !== 'string' || block.flavour === '')
      issues.push(`block "${id}" has no flavour`);
    if (block.parentId !== null && typeof block.parentId !== 'string')
      issues.push(`block "${id}" has an invalid parentId`);
    if (!isObject(block.props)) issues.push(`block "${id}" has invalid props`);

    if (block.meta !== undefined) {
      const meta = block.meta as unknown;

      if (
        !isObject(meta) ||
        typeof meta.createdAt !== 'number' ||
        typeof meta.updatedAt !== 'number' ||
        (meta.createdBy !== undefined && typeof meta.createdBy !== 'string') ||
        (meta.updatedBy !== undefined && typeof meta.updatedBy !== 'string')
      ) {
        issues.push(`block "${id}" has invalid meta`);
      }
    }

    if (typeof block.flavour === 'string' && schema.hasBlock(block.flavour)) {
      const savedWith = isObject(snapshot.schemaVersions)
        ? snapshot.schemaVersions[block.flavour]
        : undefined;
      const supported = schema.getVersion(block.flavour);

      if (typeof savedWith === 'number' && savedWith > supported) {
        issues.push(
          `block "${id}" (${block.flavour}) was saved with schema version ${savedWith}, newer than supported ${supported}`,
        );
      }
    }

    if (
      !Array.isArray(block.content) ||
      !block.content.every(
        (node) =>
          isObject(node) &&
          typeof node.insert === 'string' &&
          (node.attributes === undefined || isObject(node.attributes)),
      )
    ) {
      issues.push(`block "${id}" has invalid content`);
    }

    if (
      !Array.isArray(block.children) ||
      !block.children.every((child) => typeof child === 'string')
    ) {
      issues.push(`block "${id}" has invalid children`);
      continue;
    }

    if (new Set(block.children).size !== block.children.length)
      issues.push(`block "${id}" lists the same child twice`);

    for (const childId of block.children) {
      const child = blocks[childId];

      if (!isObject(child)) issues.push(`block "${id}" references missing child "${childId}"`);
      else if (child.parentId !== id)
        issues.push(
          `child "${childId}" has parentId "${String(child.parentId)}", expected "${id}"`,
        );
      else if (
        typeof block.flavour === 'string' &&
        typeof child.flavour === 'string' &&
        schema.hasBlock(block.flavour) &&
        schema.hasBlock(child.flavour) &&
        !schema.validateRelation(block.flavour, child.flavour)
      )
        issues.push(
          `block "${childId}" (${child.flavour}) cannot be placed inside "${id}" (${block.flavour})`,
        );
    }

    if (
      typeof block.flavour === 'string' &&
      schema.hasBlock(block.flavour) &&
      isObject(block.props)
    ) {
      const result = schema.validateProps(block.flavour, block.props);
      if (!result.success)
        issues.push(`block "${id}" (${block.flavour}) has invalid props: ${result.error.message}`);
    }
  }

  return [...issues, ...treeIssues(snapshot.rootId, blocks)];
}

/**
 * Связность дерева: один корень, у каждого блока есть родитель, который перечисляет его в `children`, и каждый
 * блок достижим из корня (так ловятся и циклы: блоки цикла от корня недостижимы).
 */
function treeIssues(rootId: string, blocks: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const get = (id: unknown) => {
    const block = typeof id === 'string' ? blocks[id] : undefined;

    return typeof block === 'object' && block !== null ? (block as Partial<BaseBlock>) : undefined;
  };

  // Множества потомков строятся один раз: проверка «родитель перечисляет блок» — O(1), а не O(ширины родителя).
  const listed = new Map<string, Set<string>>();
  const childrenOf = (id: string) => {
    let set = listed.get(id);

    if (!set) {
      const children = get(id)?.children;

      set = new Set(Array.isArray(children) ? children : []);
      listed.set(id, set);
    }

    return set;
  };

  for (const [id] of Object.entries(blocks)) {
    const block = get(id);

    if (!block || id === rootId) continue;

    if (block.parentId === null) {
      issues.push(`block "${id}" is a second root (parentId null)`);
      continue;
    }

    const parent = get(block.parentId);

    if (!parent) issues.push(`block "${id}" has a missing parent "${String(block.parentId)}"`);
    else if (!childrenOf(block.parentId as string).has(id))
      issues.push(`block "${id}" is not listed in the children of its parent "${block.parentId}"`);
  }

  const reached = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const id = stack.pop()!;

    if (reached.has(id)) {
      issues.push(`block "${id}" is reachable twice (a cycle or a shared child)`);
      continue;
    }

    reached.add(id);

    const children = get(id)?.children;

    if (Array.isArray(children))
      for (const child of children) if (typeof child === 'string' && get(child)) stack.push(child);
  }

  const unreachable = Object.keys(blocks).filter((id) => !reached.has(id));

  if (unreachable.length > 0)
    issues.push(
      `blocks not reachable from the root: ${unreachable.map((id) => `"${id}"`).join(', ')}`,
    );

  return issues;
}

export function deserializeDocument(
  snapshot: DocumentSnapshot,
  options: DeserializeOptions,
): Document {
  const migrated = migrateSnapshot(snapshot, options.schema);
  const issues = validateSnapshot(migrated, options.schema);

  if (issues.length > 0) throw new DocumentValidationError(issues);

  const document = new Document(migrated.rootId);

  for (const block of Object.values(migrated.blocks) as BaseBlock[]) {
    document._setBlock(structuredClone(block));
  }

  return document;
}
