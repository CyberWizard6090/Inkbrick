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
  formerChildren: ReadonlyMap<BlockId, readonly BlockId[]>,
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

    for (const child of formerChildren.get(id) ?? []) {
      if (!block.children.includes(child) && transaction.getBlock(child)?.parentId === id)
        issues.push(`block "${child}" was left without a parent by the change of "${id}"`);
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
 * Сводит чужой патч с тем, чего его автор не видел (правки, пришедшие сюда раньше него или ещё не дошедшие до него).
 * Правила одинаковы у всех участников, поэтому сервер, который применяет патчи по порядку и рассылает результат, приводит
 * всех к одному документу:
 *
 * - **Дети, о которых автор не знал** (блок добавили в тот же список одновременно), остаются в списке родителя — после
 *   того соседа, за которым стояли. Иначе патч, переписавший список детей, оставил бы их без родителя.
 * - **Дети, которых здесь нет** (их уже удалили или перенесли), выпадают из списка.
 * - **Блок, у которого здесь нет родителя** (родителя удалили), не появляется: удалён вместе с родителем.
 * - **Потомки удалённого блока**, которых нет в патче, удаляются вместе с ним.
 */
function mergeConcurrent(
  engine: Engine,
  transaction: Transaction,
  provided: ReadonlyMap<BlockId, BaseBlock | null>,
): Map<BlockId, BaseBlock | null> {
  const rootId = engine.store.document.rootId;
  const fits = (parent: BaseBlock, child: BaseBlock) =>
    !engine.schema.hasBlock(parent.flavour) ||
    !engine.schema.hasBlock(child.flavour) ||
    engine.schema.validateRelation(parent.flavour, child.flavour);
  const value = (id: BlockId): BaseBlock | null =>
    provided.has(id) ? provided.get(id)! : (transaction.getBlock(id) ?? null);
  const aliveMemo = new Map<BlockId, boolean>();
  // Блок жив, если он есть и цепочка родителей доходит до корня. Цикл в родителях — не жив.
  const alive = (id: BlockId, seen = new Set<BlockId>()): boolean => {
    const known = aliveMemo.get(id);

    if (known !== undefined) return known;

    const block = value(id);
    let result: boolean;

    if (!block || seen.has(id)) result = false;
    else if (block.parentId === null) result = id === rootId;
    else result = alive(block.parentId, seen.add(id));

    aliveMemo.set(id, result);

    return result;
  };

  const result = new Map<BlockId, BaseBlock | null>();
  // Дети, которым у нового вида родителя не место: переезжают к деду, сразу за родителем.
  const hoisted: { readonly parent: BlockId; readonly child: BlockId }[] = [];

  for (const [id, block] of provided) {
    if (block === null || !alive(id)) {
      result.set(id, null);
      continue;
    }

    const own = block.children.filter((child) => alive(child) && value(child)!.parentId === id);
    const current = transaction.getBlock(id);

    // Дети, о которых автор патча не знал: здесь они у этого родителя, патч их не трогает.
    current?.children.forEach((child, index) => {
      if (own.includes(child) || provided.has(child) || !alive(child)) return;
      if (transaction.getBlock(child)?.parentId !== id) return;
      if (!fits(block, transaction.getBlock(child)!)) {
        hoisted.push({ parent: id, child });
        return;
      }

      const before = current.children
        .slice(0, index)
        .reverse()
        .find((sibling) => own.includes(sibling));

      own.splice(before === undefined ? 0 : own.indexOf(before) + 1, 0, child);
    });

    result.set(id, { ...structuredClone(block), children: own });
  }

  /** Блок для правки в результате: уже из патча или здешний (копия). `null` — его нет или он удаляется. */
  const editable = (id: BlockId): BaseBlock | null => {
    if (result.has(id)) return result.get(id)!;

    const block = transaction.getBlock(id);

    if (!block) return null;

    const copy = structuredClone(block);

    result.set(id, copy);

    return copy;
  };

  // Блок, который патч перенёс, уходит из списка своего здешнего родителя, если того нет в патче (перенос, который
  // автор сделал, не зная, что здесь блок уже переехал).
  for (const [id, block] of [...result]) {
    const here = transaction.getBlock(id)?.parentId;

    if (!block || !here || here === block.parentId || provided.has(here)) continue;

    const former = editable(here);

    if (former) former.children = former.children.filter((child) => child !== id);
  }

  for (const { parent, child } of hoisted) {
    const grandparentId = result.get(parent)?.parentId;
    const grandparent = grandparentId ? editable(grandparentId) : null;
    const block = transaction.getBlock(child)!;

    if (!grandparent || !fits(grandparent, block)) {
      result.set(child, null);
      continue;
    }

    // За родителем и за детьми, переехавшими раньше: порядок сохраняется.
    let at = grandparent.children.indexOf(parent) + 1;

    while (
      at < grandparent.children.length &&
      hoisted.some((item) => item.child === grandparent.children[at])
    )
      at++;

    grandparent.children.splice(at, 0, child);
    result.set(child, { ...structuredClone(block), parentId: grandparent.id });
  }

  // Потомки удалённых блоков, которых нет в патче, удаляются вместе с ними.
  const drop = (id: BlockId) => {
    for (const child of transaction.getBlock(id)?.children ?? []) {
      if (provided.has(child) && result.get(child) !== null) continue;
      if (transaction.getBlock(child)?.parentId !== id || result.has(child)) continue;

      result.set(child, null);
      drop(child);
    }
  };

  for (const [id, block] of [...result]) if (block === null) drop(id);

  return result;
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

  const rootId = engine.store.document.rootId;

  if (patch.blocks[rootId] === null) shape.push('the root block cannot be deleted');

  if (shape.length > 0) throw new PatchError(shape);

  let changed: readonly BlockId[] = [];

  engine.store.transact(
    (transaction) => {
      const formerParents = new Map<BlockId, BlockId | null>();
      const formerChildren = new Map<BlockId, readonly BlockId[]>();
      const merged = mergeConcurrent(engine, transaction, new Map(entries));

      for (const [id, value] of merged) {
        const current = transaction.getBlock(id);

        formerParents.set(id, current?.parentId ?? null);
        formerChildren.set(id, current?.children ?? []);

        if (value === null) {
          if (current) transaction.apply(new DeleteBlockChange(id));
        } else {
          transaction.apply(new SetBlockChange(value, { stamp: false }));
        }
      }

      const issues = treeIssues(
        engine,
        transaction,
        [...merged.keys()],
        formerParents,
        formerChildren,
      );

      if (issues.length > 0) throw new PatchError(issues);

      changed = transaction.getChangedBlocks();
    },
    { history: false, origin: REMOTE_ORIGIN },
  );

  // Нормализация — уже своя правка этого участника (не `remote`): то, что она изменила (ячейки, добавленные в строку
  // после одновременных правок таблицы), уходит в `onPatch` и на сервер. Иначе такие блоки остались бы только здесь.
  let normalized: readonly BlockId[] = [];

  engine.store.transact(
    (transaction) => {
      engine.normalizer.normalizeBlocks(engine, transaction, changed);
      normalized = transaction.getChangedBlocks();
    },
    { history: false },
  );

  return [...new Set([...changed, ...normalized])];
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
 * затёрла чужую правку. Правки, которых автор патча не видел, сохраняются (`mergeConcurrent`).
 *
 * Возвращает то, что изменилось здесь, — блоки после применения и нормализации. Сервер рассылает именно это всем
 * участникам (и автору): так у всех получается один документ.
 */
export function applyPatch(editor: Editor, patch: DocumentPatch): DocumentPatch {
  const changed = applyToEngine(editor.engine, patch);

  if (editor.store.historyTouches(changed)) editor.store.clearHistory();

  const blocks: Record<BlockId, BaseBlock | null> = {};

  for (const id of changed) {
    const block = editor.store.getBlock(id);

    blocks[id] = block ? structuredClone(block) : null;
  }

  return { blocks };
}
