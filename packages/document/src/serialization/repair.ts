import type { BaseBlock, DocumentSnapshot, InlineNode } from '../model';
import type { SchemaRegistry } from '../schema';

export interface RepairResult {
  readonly snapshot: DocumentSnapshot;
  /** Что исправлено, по строке на правку. Пустой список — снимок был цел. */
  readonly fixes: readonly string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNode = (node: unknown): node is InlineNode =>
  isObject(node) &&
  typeof node.insert === 'string' &&
  (node.attributes === undefined || isObject(node.attributes));

/**
 * Восстанавливает повреждённый снимок (файл, ответ сервера), чтобы его можно было открыть, теряя как можно меньше:
 *
 * - блоки-не объекты и ссылки на несуществующих потомков убираются, повторы в `children` — тоже;
 * - каждый блок оставляется ровно в одном родителе — в первом, где он встретился при обходе от корня;
 *   `parentId` выставляется по нему;
 * - недостижимые блоки (сироты, лишние корни, циклы) переносятся в конец первой заметки (или корня) вместе
 *   со своими потомками; блок, которому там не место по схеме, удаляется;
 * - недопустимые props известных блоков заменяются значениями по умолчанию;
 * - пропавший корень создаётся заново (пустая страница).
 *
 * Блоки неизвестного типа сохраняются. Результат стоит показать пользователю: `fixes` перечисляет потери.
 *
 * ```ts
 * const { snapshot, fixes } = repairSnapshot(raw, schema);
 * const document = deserializeDocument(snapshot, { schema });
 * ```
 */
export function repairSnapshot(input: DocumentSnapshot, schema: SchemaRegistry): RepairResult {
  const fixes: string[] = [];
  const rootId =
    isObject(input) && typeof input.rootId === 'string' && input.rootId ? input.rootId : 'root';
  const source: Record<string, unknown> =
    isObject(input) && isObject(input.blocks) ? input.blocks : {};
  const blocks = new Map<string, BaseBlock>();

  if (!isObject(input) || !isObject(input.blocks)) fixes.push('snapshot had no blocks object');

  for (const [id, raw] of Object.entries(source)) {
    if (!isObject(raw)) {
      fixes.push(`dropped block "${id}": not an object`);
      continue;
    }

    if (typeof raw.flavour !== 'string' || raw.flavour === '') {
      fixes.push(`dropped block "${id}": no flavour`);
      continue;
    }

    if (raw.id !== id) fixes.push(`block "${id}": id fixed to match its key`);

    const content = Array.isArray(raw.content) ? raw.content.filter(isNode) : [];

    if (!Array.isArray(raw.content) || content.length !== raw.content.length)
      fixes.push(`block "${id}": invalid content removed`);

    blocks.set(id, {
      ...(raw as unknown as BaseBlock),
      id,
      flavour: raw.flavour,
      parentId: null,
      children: Array.isArray(raw.children)
        ? raw.children.filter((child): child is string => typeof child === 'string')
        : [],
      content: structuredClone(content),
      props: isObject(raw.props) ? structuredClone(raw.props) : {},
    });
  }

  let root = blocks.get(rootId);

  if (!root) {
    root = {
      id: rootId,
      flavour: 'block:page',
      parentId: null,
      children: [],
      content: [],
      props: schema.hasBlock('block:page') ? schema.createProps('block:page') : {},
    };
    blocks.set(rootId, root);
    fixes.push(`root "${rootId}" was missing: created an empty page`);
  }

  const accepts = (parent: BaseBlock, child: BaseBlock) =>
    !schema.hasBlock(parent.flavour) ||
    !schema.hasBlock(child.flavour) ||
    schema.validateRelation(parent.flavour, child.flavour);

  // 3. Обход от корня: блок принадлежит первому родителю, в котором встретился.
  const owner = new Map<string, string>();
  const attach = (startId: string) => {
    const queue = [startId];

    // Индекс вместо shift(): shift() сдвигает массив и делает обход квадратичным.
    for (let head = 0; head < queue.length; head++) {
      const parent = blocks.get(queue[head])!;
      const kept: string[] = [];

      for (const childId of parent.children) {
        const child = blocks.get(childId);

        if (!child) {
          fixes.push(`block "${parent.id}": removed reference to missing child "${childId}"`);
        } else if (childId === rootId || owner.has(childId) || childId === parent.id) {
          fixes.push(`block "${parent.id}": removed duplicate or cyclic child "${childId}"`);
        } else {
          owner.set(childId, parent.id);
          kept.push(childId);
          queue.push(childId);
        }
      }

      blocks.set(parent.id, { ...parent, children: kept });
    }
  };

  owner.set(rootId, '');
  attach(rootId);

  const container = () => {
    const top = blocks.get(rootId)!;
    const hub = top.children
      .map((id) => blocks.get(id)!)
      .find((block) => schema.getRole(block.flavour) === 'hub');

    return hub ?? top;
  };

  for (const id of [...blocks.keys()]) {
    if (owner.has(id) || !blocks.has(id)) continue;

    // Верх «оторванного» поддерева: идём по исходным parentId, пока они ведут в недостижимые блоки.
    let top = id;
    const seen = new Set([id]);

    for (;;) {
      const raw = source[top] as Record<string, unknown> | undefined;
      const parentId = typeof raw?.parentId === 'string' ? raw.parentId : null;

      if (!parentId || !blocks.has(parentId) || owner.has(parentId) || seen.has(parentId)) break;

      seen.add(parentId);
      top = parentId;
    }

    const block = blocks.get(top)!;
    const target = [container(), blocks.get(rootId)!].find((parent) => accepts(parent, block));

    if (!target) {
      blocks.delete(top);
      fixes.push(`dropped unreachable block "${top}" (${block.flavour}): no place for it`);
      continue;
    }

    owner.set(top, target.id);
    blocks.set(target.id, { ...target, children: [...target.children, top] });
    fixes.push(`re-attached unreachable block "${top}" to "${target.id}"`);
    attach(top);
  }

  // Блоки, удалённые выше, не должны остаться в чужих children.
  for (const block of blocks.values()) {
    const children = block.children.filter((id) => blocks.has(id));

    if (children.length !== block.children.length) blocks.set(block.id, { ...block, children });
  }

  for (const block of [...blocks.values()]) {
    const parentId = block.id === rootId ? null : (owner.get(block.id) ?? null);
    const raw = source[block.id] as Record<string, unknown> | undefined;

    if (raw && raw.parentId !== parentId && block.id !== rootId)
      fixes.push(`block "${block.id}": parentId fixed to "${String(parentId)}"`);
    if (block.id === rootId && raw && raw.parentId !== null)
      fixes.push(`root "${rootId}": parentId fixed to null`);

    let props = block.props;

    if (schema.hasBlock(block.flavour) && !schema.validateProps(block.flavour, props).success) {
      props = schema.createProps(block.flavour);
      fixes.push(`block "${block.id}" (${block.flavour}): invalid props replaced with defaults`);
    }

    blocks.set(block.id, { ...block, parentId, props });
  }

  return {
    snapshot: {
      ...(isObject(input) ? input : {}),
      rootId,
      blocks: Object.fromEntries(blocks),
    } as DocumentSnapshot,
    fixes,
  };
}
