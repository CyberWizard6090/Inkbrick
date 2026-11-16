import * as Y from 'yjs';

import {
  SNAPSHOT_VERSION,
  type BaseBlock,
  type BlockId,
  type BlockProps,
  type DocumentSnapshot,
  type InlineNode,
  type RepairTree,
  type SchemaRegistry,
} from '@inkbrick/document';

import { getBlocks, getMeta, readPlace, readRootId } from './format';
import { compareOrder } from './order';
import { readInline } from './textDiff';

interface Entry {
  id: BlockId;
  flavour: string;
  p: BlockId | null;
  k: string;
  props: BlockProps;
  content: InlineNode[];
}

/**
 * Проекция `Y.Doc` в снимок модели — чистая функция, одинаковая у всех клиентов (правила 1–3 из docs/collab.md).
 *
 *  1. Записи неверной формы пропускаются.
 *  2. `children` строятся из `place`, порядок `(k, blockId)`.
 *  3. Блоки, недостижимые от корня, прикрепляются в конец первого потомка корня вместе с поддеревьями: сироты — по
 *     верхнему блоку, цикл — по блоку с наименьшим `id`.
 *
 * Правила схемы (правило 4) — в `normalizeSnapshot`. Проекция ничего не пишет в `Y.Doc`.
 */
export function project(ydoc: Y.Doc): DocumentSnapshot {
  const rootId = readRootId(ydoc);
  const entries = new Map<BlockId, Entry>();

  getBlocks(ydoc).forEach((yblock, id) => {
    if (!(yblock instanceof Y.Map)) return;

    const flavour = yblock.get('flavour');
    const place = readPlace(yblock.get('place'));
    const props = yblock.get('props');
    const text = yblock.get('text');

    if (typeof flavour !== 'string' || !place) return;
    if (!(props instanceof Y.Map) || !(text instanceof Y.Text)) return;

    entries.set(id, {
      id,
      flavour,
      p: place.p,
      k: place.k,
      props: props.toJSON() as BlockProps,
      content: readInline(text),
    });
  });

  if (!entries.has(rootId)) {
    throw new Error(`Y.Doc has no root block "${rootId}"`);
  }

  const childrenOf = new Map<BlockId, Entry[]>();

  for (const entry of entries.values()) {
    if (entry.id === rootId || entry.p === null || !entries.has(entry.p)) continue;

    const list = childrenOf.get(entry.p);

    if (list) list.push(entry);
    else childrenOf.set(entry.p, [entry]);
  }

  for (const list of childrenOf.values()) list.sort(compareOrder);

  const finalParent = new Map<BlockId, BlockId | null>([[rootId, null]]);
  const extra = new Map<BlockId, BlockId[]>();

  const walk = (start: BlockId): void => {
    const stack = [start];

    while (stack.length > 0) {
      const current = stack.pop()!;

      for (const child of childrenOf.get(current) ?? []) {
        if (finalParent.has(child.id)) continue;

        finalParent.set(child.id, current);
        stack.push(child.id);
      }
    }
  };

  walk(rootId);

  const target = childrenOf.get(rootId)?.[0]?.id ?? rootId;

  const reroute = (id: BlockId): void => {
    finalParent.set(id, target);

    const list = extra.get(target);

    if (list) list.push(id);
    else extra.set(target, [id]);

    walk(id);
  };

  const unreachable = [...entries.keys()].filter((id) => !finalParent.has(id)).sort();

  for (const id of unreachable) {
    const entry = entries.get(id)!;

    if (!finalParent.has(id) && (entry.p === null || !entries.has(entry.p))) reroute(id);
  }

  for (const id of unreachable) {
    if (!finalParent.has(id)) reroute(id);
  }

  const blocks: Record<BlockId, BaseBlock> = {};

  for (const [id, parentId] of finalParent) {
    const entry = entries.get(id)!;
    const children = (childrenOf.get(id) ?? [])
      .filter((child) => finalParent.get(child.id) === id)
      .map((child) => child.id);

    blocks[id] = {
      id,
      flavour: entry.flavour,
      parentId,
      children: [...children, ...(extra.get(id) ?? [])],
      content: entry.content,
      props: entry.props,
    };
  }

  const versions = getMeta(ydoc).get('schemaVersions');

  return {
    version: SNAPSHOT_VERSION,
    rootId,
    blocks,
    schemaVersions:
      typeof versions === 'object' && versions !== null ? { ...(versions as object) } : {},
  } as DocumentSnapshot;
}

/**
 * Правило 4 проекции: по схеме. Блок, которому `validateRelation` не разрешает лежать в родителе, поднимается к
 * первому предку, где можно, и встаёт сразу после ветки, из которой вышел; `props`, не прошедшие `propsSchema`,
 * заменяются значениями по умолчанию.
 *
 * Блок, для которого подходящего предка нет, остаётся на месте, кроме блоков, которые вообще не живут вне своего
 * контейнера (`allowedParents` — список конкретных блоков: ячейка таблицы, строка, колонка). Если контейнер удалили,
 * пока в нём правили, такой блок вместе с потомками отбрасывается: «удаление таблицы побеждает».
 *
 * Затем вызываются `repair` схем (строки таблицы выравниваются по ширине, пустая колонка получает абзац). Новые блоки
 * получают идентификаторы из идентификатора родителя и номера среди достроенных, поэтому у всех участников они одинаковы; в `Y.Doc`
 * они попадают, только когда кто-то в них что-то напишет.
 */
export function normalizeSnapshot(
  snapshot: DocumentSnapshot,
  schema: SchemaRegistry,
): DocumentSnapshot {
  const blocks: Record<BlockId, BaseBlock> = {};

  for (const [id, block] of Object.entries(snapshot.blocks)) {
    let props = block.props;

    if (schema.hasBlock(block.flavour) && !schema.validateProps(block.flavour, props).success) {
      props = schema.createProps(block.flavour);
    }

    blocks[id] = { ...block, props, children: [...block.children] };
  }

  const allowed = (parent: BaseBlock, child: BaseBlock): boolean =>
    !schema.hasBlock(parent.flavour) ||
    !schema.hasBlock(child.flavour) ||
    schema.validateRelation(parent.flavour, child.flavour);

  const visit = (id: BlockId, ancestors: readonly BlockId[]): void => {
    const parent = blocks[id];
    const path = [...ancestors, id];

    for (const childId of [...parent.children]) {
      const child = blocks[childId];

      if (!child) continue;

      if (allowed(parent, child)) {
        visit(childId, path);
        continue;
      }

      let lifted = false;

      for (let i = path.length - 2; i >= 0; i--) {
        const ancestor = blocks[path[i]];

        if (!allowed(ancestor, child)) continue;

        parent.children = parent.children.filter((item) => item !== childId);

        const branch = ancestor.children.indexOf(path[i + 1]);

        ancestor.children.splice(branch + 1, 0, childId);
        blocks[childId] = { ...child, parentId: ancestor.id };
        visit(childId, path.slice(0, i + 1));
        lifted = true;
        break;
      }

      if (lifted) continue;

      if (onlyInsideContainers(child)) {
        parent.children = parent.children.filter((item) => item !== childId);
        dropSubtree(childId);
        continue;
      }

      visit(childId, path);
    }
  };

  const onlyInsideContainers = (block: BaseBlock): boolean => {
    const parents = schema.getBlockSchema(block.flavour)?.allowedParents;

    return Array.isArray(parents) && parents.every((entry) => !entry.startsWith('role:'));
  };

  const dropSubtree = (rootOfDrop: BlockId): void => {
    const stack = [rootOfDrop];

    while (stack.length > 0) {
      const id = stack.pop()!;
      const block = blocks[id];

      if (!block) continue;

      delete blocks[id];
      stack.push(...block.children);
    }
  };

  visit(snapshot.rootId, []);
  repairStructure(blocks, schema);

  return { ...snapshot, blocks };
}

/** `BlockSchema.repair` для всех блоков с детерминированными идентификаторами новых блоков. */
function repairStructure(blocks: Record<BlockId, BaseBlock>, schema: SchemaRegistry): void {
  const tree: RepairTree = {
    get: (id) => blocks[id],
    append(parentId, flavour) {
      const parent = blocks[parentId]!;
      // Номер считается среди уже достроенных потомков, а не по месту в списке: число настоящих детей меняется,
      // а блок, который кто-то успел заполнить, должен остаться тем же.
      const prefix = `${parentId}~${flavour.replace('block:', '')}`;
      let id = `${prefix}${parent.children.filter((childId) => childId.startsWith(prefix)).length}`;

      // Идентификатор мог быть занят блоком из Y.Doc, который сейчас лежит в другом месте.
      while (blocks[id]) id += '_';

      const child: BaseBlock = {
        id,
        flavour,
        parentId,
        children: [],
        content: [],
        props: schema.hasBlock(flavour) ? schema.createProps(flavour) : {},
      };

      blocks[id] = child;
      blocks[parentId] = { ...parent, children: [...parent.children, id] };

      return child;
    },
  };

  for (const id of Object.keys(blocks).sort()) {
    const block = blocks[id];

    if (block) schema.getBlockSchema(block.flavour)?.repair?.(block, tree);
  }
}
