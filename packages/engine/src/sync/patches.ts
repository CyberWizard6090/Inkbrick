import type { BaseBlock, BlockId } from '@inkbrick/document';
import {
  DeleteBlockChange,
  SetBlockChange,
  type ChangeInfo,
  type Transaction,
} from '@inkbrick/store';

import type { Editor } from '../editor/Editor';
import type { Engine } from '../editor/Engine';

/**
 * Изменение документа для обмена между участниками: блоки после правки по `id`, `null` — блок удалён. Самодостаточно и
 * идемпотентно: применить его дважды — то же, что один раз. Блок передаётся целиком (последний пишущий выигрывает на
 * уровне блока): одновременные правки одного блока разными участниками сливает не он, а надстройка (сервер, CRDT).
 */
export interface DocumentPatch {
  readonly blocks: Readonly<Record<BlockId, BaseBlock | null>>;
}

/** Патч своей правки: `source` — правка, отмена или повтор. */
export interface LocalPatch extends DocumentPatch {
  readonly source: ChangeInfo['source'];
}

/** Чужой патч не прошёл проверку: документ не изменён. */
export class PatchError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid document patch:\n- ${issues.join('\n- ')}`);
    this.name = 'PatchError';
  }
}

/** Метка чужих правок в `ChangeInfo.origin`: их патчи не рассылаются обратно. */
export const REMOTE_ORIGIN = 'remote';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function shapeIssues(id: string, value: unknown): string[] {
  if (value === null) return [];
  if (!isObject(value)) return [`block "${id}" is not an object`];

  const issues: string[] = [];

  if (value.id !== id) issues.push(`block "${id}" has id "${String(value.id)}"`);
  if (typeof value.flavour !== 'string' || value.flavour === '')
    issues.push(`block "${id}" has no flavour`);
  if (value.parentId !== null && typeof value.parentId !== 'string')
    issues.push(`block "${id}" has an invalid parentId`);
  if (!Array.isArray(value.children) || !value.children.every((child) => typeof child === 'string'))
    issues.push(`block "${id}" has invalid children`);
  if (
    !Array.isArray(value.content) ||
    !value.content.every((node) => isObject(node) && typeof node.insert === 'string')
  )
    issues.push(`block "${id}" has invalid content`);
  if (!isObject(value.props)) issues.push(`block "${id}" has invalid props`);

  return issues;
}

/** Дерево вокруг изменённых блоков цело: родитель числит блок, потомки существуют и указывают на него. */
function treeIssues(
  engine: Engine,
  transaction: Transaction,
  changed: readonly BlockId[],
  formerParents: ReadonlyMap<BlockId, BlockId | null>,
): string[] {
  const issues: string[] = [];
  const rootId = engine.store.document.rootId;

  for (const id of changed) {
    const block = transaction.getBlock(id);

    if (!block) {
      const parent = formerParents.get(id);

      if (id === rootId) issues.push('the root block cannot be deleted');
      else if (parent && transaction.getBlock(parent)?.children.includes(id))
        issues.push(`deleted block "${id}" is still a child of "${parent}"`);
      continue;
    }

    if (id === rootId ? block.parentId !== null : !block.parentId)
      issues.push(`block "${id}" has a wrong parentId`);
    else if (block.parentId && !transaction.getBlock(block.parentId)?.children.includes(id))
      issues.push(`block "${id}" is not a child of its parent "${block.parentId}"`);

    if (new Set(block.children).size !== block.children.length)
      issues.push(`block "${id}" lists a child twice`);

    for (const child of block.children) {
      if (transaction.getBlock(child)?.parentId !== id)
        issues.push(`child "${child}" of "${id}" is missing or belongs elsewhere`);
    }

    if (engine.schema.hasBlock(block.flavour)) {
      try {
        engine.schema.createProps(block.flavour, block.props);
      } catch (error) {
        issues.push(
          `block "${id}" (${block.flavour}) has invalid props: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return issues;
}

/**
 * Применяет чужой патч одной транзакцией вне локальной истории, с меткой `remote`: проверяет форму блоков, целостность
 * дерева и props по схеме (иначе `PatchError`, документ не меняется), затем нормализует изменённые блоки.
 */
function applyToEngine(engine: Engine, patch: DocumentPatch): readonly BlockId[] {
  if (!isObject(patch) || !isObject(patch.blocks))
    throw new PatchError(['the patch has no blocks object']);

  const entries = Object.entries(patch.blocks);
  const shape = entries.flatMap(([id, value]) => shapeIssues(id, value));

  if (patch.blocks[engine.store.document.rootId] === null)
    shape.push('the root block cannot be deleted');

  if (shape.length > 0) throw new PatchError(shape);

  let changed: readonly BlockId[] = [];

  engine.store.transact(
    (transaction) => {
      const formerParents = new Map<BlockId, BlockId | null>();

      for (const [id, value] of entries) {
        const current = transaction.getBlock(id);

        formerParents.set(id, current?.parentId ?? null);

        if (value === null) {
          if (current) transaction.apply(new DeleteBlockChange(id));
        } else {
          transaction.apply(new SetBlockChange(structuredClone(value), { stamp: false }));
        }
      }

      const issues = treeIssues(
        engine,
        transaction,
        entries.map(([id]) => id),
        formerParents,
      );

      if (issues.length > 0) throw new PatchError(issues);

      engine.normalizer.normalizeChanged(engine, transaction);
      changed = transaction.getChangedBlocks();
    },
    { history: false, origin: REMOTE_ORIGIN },
  );

  return changed;
}

/**
 * Подписка на свои правки редактора как патчи: после каждой правки, отмены и повтора — изменённые блоки целиком (`null` —
 * удалён). Их отправляют другим участникам или на сервер; чужие патчи (`applyPatch`) сюда не попадают. Возвращает
 * отписку. Отдельная функция, а не метод редактора: приложению без совместной правки она не добавляет веса.
 */
export function onPatch(editor: Editor, listener: (patch: LocalPatch) => void): () => void {
  return editor.store.subscribeChanges((ids, info) => {
    if (info.origin === REMOTE_ORIGIN) return;

    const blocks: Record<string, BaseBlock | null> = {};

    for (const id of ids) {
      const block = editor.store.getBlock(id);

      blocks[id] = block ? structuredClone(block) : null;
    }

    listener({ blocks, source: info.source });
  });
}

/**
 * Применяет чужой патч (от другого участника или сервера): одной правкой вне локальной истории отмены, с проверкой формы,
 * целостности дерева и props по схеме (иначе `PatchError`, документ не меняется) и нормализацией. Работает и в режиме
 * только для чтения. Если патч задел блоки из локальной истории, история очищается: отмена вернула бы блоки целиком и
 * затёрла чужую правку.
 */
export function applyPatch(editor: Editor, patch: DocumentPatch): void {
  const changed = applyToEngine(editor.engine, patch);

  if (editor.store.historyTouches(changed)) editor.store.clearHistory();
}
