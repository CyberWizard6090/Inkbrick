import { describe, expect, it } from 'vitest';

import { serializeDocument, validateSnapshot, type BaseBlock } from '@inkbrick/document';

import {
  Editor,
  PatchError,
  applyPatch,
  columnsFeature,
  onPatch,
  tableFeature,
  tableSize,
  toggleFeature,
  type DocumentPatch,
} from '../src/internal';

/**
 * Одновременная правка: несколько редакторов и сервер, который задаёт правкам порядок. Каждый участник правит свою копию
 * документа и сразу видит свою правку, патч уходит на сервер. Сервер применяет патчи по порядку прихода и рассылает
 * всем (и автору) результат — блоки после применения. Сеть доставляет сообщения с произвольными задержками, но по
 * порядку внутри одного канала. Когда правки кончились и все сообщения дошли, документы всех участников совпадают с
 * серверным и целы. Падение воспроизводится по зерну.
 */

function random(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const features = () => [tableFeature, columnsFeature, toggleFeature];

/** Документ без отметок времени. */
function state(editor: Editor): string {
  const blocks = editor.document.dump();

  return JSON.stringify(
    Object.keys(blocks)
      .sort()
      .map((id) => {
        const { meta: _meta, ...rest } = blocks[id] as BaseBlock;

        return rest;
      }),
  );
}

const issues = (editor: Editor) =>
  validateSnapshot(serializeDocument(editor.document, editor.schema), editor.schema);

/** Патч, который приводит документ `editor` к `blocks` целиком (переподключение участника). */
function snapshotPatch(editor: Editor, blocks: Record<string, BaseBlock>): DocumentPatch {
  const patch: Record<string, BaseBlock | null> = structuredClone(blocks);

  for (const id of Object.keys(editor.document.dump())) if (!(id in blocks)) patch[id] = null;

  return { blocks: patch };
}

const FLAVOURS = ['block:paragraph', 'block:heading', 'block:list', 'block:quote', 'block:toggle'];

type Message =
  | { readonly kind: 'patch'; readonly patch: DocumentPatch }
  | { readonly kind: 'snapshot'; readonly blocks: Record<string, BaseBlock> };

function run(seed: number, clients: number, steps: number) {
  const rand = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const int = (max: number) => Math.floor(rand() * (max + 1));

  // Общий начальный документ.
  const server = new Editor({ features: features() });
  const note = server.document.getBlock(server.document.rootId)!.children[0];

  for (const flavour of ['block:list', 'block:list', 'block:paragraph', 'block:toggle']) {
    const afterId = server.document.getBlock(note)!.children.at(-1)!;

    server.dispatch({ type: 'insertBlock', payload: { flavour, afterId } });
  }

  const initial = server.document.dump();
  const editors = Array.from({ length: clients }, () => {
    const editor = new Editor({ features: features() });

    applyPatch(editor, snapshotPatch(editor, initial));
    editor.clearHistory();

    return editor;
  });

  // Каналы: к серверу от каждого участника и от сервера к каждому. FIFO внутри канала.
  const up: DocumentPatch[][] = editors.map(() => []);
  const down: Message[][] = editors.map(() => []);
  const stats = { edits: 0, rejectedOnServer: 0, resyncs: 0 };
  const log: string[] = [];

  editors.forEach((editor, index) => onPatch(editor, (patch) => up[index].push(patch)));

  // Сервер применяет патч и рассылает всем результат: блоки после применения у него (вместе с нормализацией).
  const serve = (from: number, patch: DocumentPatch) => {
    let result: DocumentPatch;

    try {
      result = applyPatch(server, patch);
    } catch (error) {
      if (!(error instanceof PatchError)) throw error;

      // Сервер не принял патч: автор возвращается к серверному документу.
      stats.rejectedOnServer++;
      log.push(`server rejected ${from}: ${error.issues[0]}`);
      down[from].push({ kind: 'snapshot', blocks: server.document.dump() });

      return;
    }

    expect(issues(server), `seed ${seed}: server after a patch of ${from}`).toEqual([]);
    if (Object.keys(result.blocks).length > 0)
      for (const queue of down) queue.push({ kind: 'patch', patch: result });
  };

  const receive = (index: number, message: Message) => {
    const editor = editors[index];

    if (message.kind === 'snapshot') {
      stats.resyncs++;
      applyPatch(editor, snapshotPatch(editor, message.blocks));
      return;
    }

    try {
      applyPatch(editor, message.patch);
    } catch (error) {
      if (!(error instanceof PatchError)) throw error;

      // Участник не может применить серверный результат: переподключается к серверному документу.
      log.push(`client ${index} rejected: ${error.issues[0]}`);
      down[index].push({ kind: 'snapshot', blocks: server.document.dump() });
    }

    expect(issues(editor), `seed ${seed}: client ${index} after a server patch`).toEqual([]);
  };

  const edit = (index: number) => {
    const editor = editors[index];
    const all = Object.values(editor.document.dump()).filter(
      (block) => block.flavour !== 'block:page' && block.flavour !== 'block:note',
    );
    const textual = all.filter(
      (block) => editor.schema.getBlockSchema(block.flavour)?.inline !== false,
    );
    const length = (block: BaseBlock) =>
      block.content.reduce((n, node) => n + node.insert.length, 0);

    if (all.length === 0 || textual.length === 0) return;

    const block = pick(textual);
    const at = int(length(block));
    const intents: (() => { type: string; payload: Record<string, unknown> })[] = [
      () => ({
        type: 'replaceText',
        payload: { blockId: block.id, from: at, to: at, text: pick(['a', 'b ', 'cd']) },
      }),
      () => ({
        type: 'deleteText',
        payload: { blockId: block.id, from: at, to: Math.min(length(block), at + 2) },
      }),
      () => ({ type: 'splitBlock', payload: { blockId: block.id, offset: at } }),
      () => ({ type: 'deleteBackward', payload: { blockId: block.id, offset: 0 } }),
      () => ({ type: 'insertBlock', payload: { flavour: pick(FLAVOURS), afterId: pick(all).id } }),
      () => ({ type: 'convertBlock', payload: { blockId: block.id, flavour: pick(FLAVOURS) } }),
      () => ({
        type: 'moveBlock',
        payload: {
          blockId: pick(all).id,
          targetId: pick(all).id,
          position: pick(['before', 'after'] as const),
        },
      }),
      () => ({ type: pick(['indentBlock', 'outdentBlock']), payload: { blockId: pick(all).id } }),
      () => ({ type: 'duplicateBlock', payload: { blockId: pick(all).id } }),
      () => ({ type: 'delete-blocks', payload: { ids: [pick(all).id] } }),
      () => ({
        type: 'toggleFormatRange',
        payload: {
          from: { blockId: block.id, offset: 0 },
          to: { blockId: block.id, offset: length(block) },
          format: 'bold',
        },
      }),
      () => ({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: pick(all).id },
      }),
      () => ({
        type: 'moveBlockToSide',
        payload: {
          blockId: pick(all).id,
          targetId: pick(all).id,
          side: pick(['left', 'right'] as const),
        },
      }),
      () => {
        const tables = all.filter((item) => item.flavour === 'block:table');

        if (tables.length === 0) return { type: 'noop', payload: {} };

        const table = pick(tables);
        const size = tableSize((id) => editor.document.getBlock(id), table.id)!;
        const row = int(size.rows - 1);
        const column = int(size.columns - 1);

        return pick([
          { type: 'insertTableRow', payload: { blockId: table.id, index: int(size.rows) } },
          { type: 'insertTableColumn', payload: { blockId: table.id, index: int(size.columns) } },
          { type: 'deleteTableRow', payload: { blockId: table.id, index: row } },
          { type: 'deleteTableColumn', payload: { blockId: table.id, index: column } },
          {
            type: 'mergeTableCells',
            payload: {
              blockId: table.id,
              range: {
                top: row,
                left: column,
                bottom: Math.min(size.rows - 1, row + 1),
                right: Math.min(size.columns - 1, column + 1),
              },
            },
          },
          { type: 'splitTableCell', payload: { blockId: table.id, row, column } },
        ]);
      },
    ];
    const intent = pick(intents)();

    editor.sealHistory();

    try {
      editor.execute(intent.type as never, intent.payload as never);
      stats.edits++;
    } catch {
      // Недопустимая правка откатывается и патча не даёт.
    }

    expect(issues(editor), `seed ${seed}: client ${index} after ${intent.type}`).toEqual([]);
  };

  const deliver = () => {
    const pending = [
      ...up.flatMap((queue, index) =>
        queue.length > 0 ? [() => serve(index, queue.shift()!)] : [],
      ),
      ...down.flatMap((queue, index) =>
        queue.length > 0 ? [() => receive(index, queue.shift()!)] : [],
      ),
    ];

    if (pending.length === 0) return false;

    pick(pending)();

    return true;
  };

  for (let step = 0; step < steps; step++) {
    if (rand() < 0.45) edit(int(clients - 1));
    else deliver();
  }

  // Правки кончились: сеть доставляет всё, что в пути.
  for (let guard = 0; deliver(); guard++) expect(guard).toBeLessThan(3_000);

  return { server, editors, stats, log };
}

describe('concurrent editing through a server that orders the patches', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    it(`seed ${seed}: three editors converge on the server document`, () => {
      const { server, editors, stats } = run(seed, 3, 400);

      expect(stats.edits).toBeGreaterThan(80);
      expect(issues(server)).toEqual([]);

      for (const [index, editor] of editors.entries()) {
        expect(issues(editor), `client ${index}`).toEqual([]);
        expect(state(editor), `client ${index}`).toBe(state(server));
      }
    });
  }
});
