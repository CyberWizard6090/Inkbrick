import { afterAll, describe, it } from 'vitest';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import {
  createSchemaRegistry,
  deserializeDocument,
  exportDocument,
  MAX_NESTING_DEPTH,
  serializeDocument,
  validateSnapshot,
  type DocumentSnapshot,
} from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';
import { DocumentView, EditorProvider, type DocumentViewProps } from '@inkbrick/react';

/*
 * Нагрузочные сценарии из ревью. Это замеры, а не проверки: результат — таблица в консоли.
 * Запуск: pnpm bench (BENCH_SIZES=1000,10000 — свой набор размеров).
 */

const schema = createSchemaRegistry();
const rows: Array<Record<string, string | number>> = [];
const SIZES = (process.env.BENCH_SIZES ?? '1000,10000,50000,100000').split(',').map(Number);

const gc = () => (globalThis as { gc?: () => void }).gc?.();
const heapMb = () => process.memoryUsage().heapUsed / 1024 / 1024;

function time<T>(fn: () => T): { ms: number; result: T } {
  const started = performance.now();
  const result = fn();

  return { ms: Math.round((performance.now() - started) * 10) / 10, result };
}

function safe(fn: () => unknown): number | string {
  try {
    return time(fn).ms;
  } catch (error) {
    return `fails: ${error instanceof Error ? error.message.slice(0, 60) : String(error)}`;
  }
}

function record(
  scenario: string,
  size: number,
  ms: number | string,
  extra: Record<string, string | number> = {},
) {
  rows.push({ scenario, size, ms, ...extra });
}

function snapshotOf(
  count: number,
  { nested = false, text = (i: number) => `Paragraph ${i}` } = {},
): DocumentSnapshot {
  const blocks: DocumentSnapshot['blocks'] = {
    root: {
      id: 'root',
      flavour: 'block:page',
      parentId: null,
      children: ['note'],
      content: [],
      props: { title: 'Bench' },
    },
    note: {
      id: 'note',
      flavour: 'block:note',
      parentId: 'root',
      children: [],
      content: [],
      props: {},
    },
  };
  let parent = 'note';

  for (let i = 0; i < count; i++) {
    const id = `b${i}`;

    blocks[id] = {
      id,
      flavour: nested ? 'block:list' : 'block:paragraph',
      parentId: parent,
      children: [],
      content: [{ insert: text(i) }],
      props: nested ? { type: 'bullet' } : {},
    };
    blocks[parent].children.push(id);
    if (nested) parent = id;
  }

  return { rootId: 'root', blocks };
}

function load(snapshot: DocumentSnapshot): Editor {
  return new Editor({ schema, document: deserializeDocument(snapshot, { schema }) });
}

function traverse(editor: Editor): number {
  let count = 0;
  const stack = [editor.document.rootId];

  while (stack.length > 0) {
    const block = editor.document.getBlock(stack.pop()!);

    if (!block) continue;
    count++;
    for (let i = block.children.length - 1; i >= 0; i--) stack.push(block.children[i]);
  }

  return count;
}

interface Mounted {
  readonly container: HTMLElement;
  readonly unmount: () => void;
}

function mount(
  editor: Editor,
  renderer?: DocumentViewProps['renderer'],
): { ms: number | string; mounted: Mounted } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  const ms = safe(() =>
    flushSync(() =>
      root.render(
        <EditorProvider editor={editor} formulaRenderer={false} highlighter={false}>
          <DocumentView renderer={renderer} />
        </EditorProvider>,
      ),
    ),
  );

  return {
    ms,
    mounted: {
      container,
      unmount: () => {
        flushSync(() => root.unmount());
        container.remove();
      },
    },
  };
}

function renderTime(editor: Editor, renderer?: DocumentViewProps['renderer']): number | string {
  const { ms, mounted } = mount(editor, renderer);

  mounted.unmount();

  return ms;
}

describe('model: N flat blocks', () => {
  for (const size of SIZES) {
    it(`${size} blocks`, () => {
      const snapshot = snapshotOf(size);

      gc();
      const heapBefore = heapMb();
      const loaded = time(() => load(snapshot));
      const editor = loaded.result;

      gc();
      record('load (validate + deserialize)', size, loaded.ms, {
        heapMb: Math.round(heapMb() - heapBefore),
      });
      record('validateSnapshot', size, time(() => validateSnapshot(snapshot, schema)).ms);
      record('serialize', size, time(() => serializeDocument(editor.document)).ms);
      record('full traversal', size, time(() => traverse(editor)).ms);
      record(
        'getChildren(note) ×100',
        size,
        time(() => {
          for (let i = 0; i < 100; i++) editor.document.getChildren('note');
        }).ms,
      );

      const middle = `b${Math.floor(size / 2)}`;

      record(
        'typing in the middle block ×200',
        size,
        safe(() => {
          for (let i = 0; i < 200; i++)
            editor.dispatch({
              type: 'replaceText',
              payload: { blockId: middle, from: i, to: i, text: 'x' },
            });
        }),
      );
      record(
        'insertBlock in the middle ×100',
        size,
        safe(() => {
          for (let i = 0; i < 100; i++)
            editor.dispatch({
              type: 'insertBlock',
              payload: { flavour: 'block:paragraph', afterId: middle },
            });
        }),
      );
      record(
        'copyFragment of 100 blocks ×10',
        size,
        safe(() => {
          for (let i = 0; i < 10; i++)
            editor.copyFragment({ blockId: 'b10', offset: 0 }, { blockId: 'b110', offset: 3 });
        }),
      );
      record(
        'deleteRange over 100 blocks',
        size,
        safe(() =>
          editor.dispatch({
            type: 'deleteRange',
            payload: { from: { blockId: 'b10', offset: 2 }, to: { blockId: 'b110', offset: 3 } },
          }),
        ),
      );
      record(
        'undo + redo',
        size,
        safe(() => {
          editor.undo();
          editor.redo();
        }),
      );
      record(
        'export markdown',
        size,
        safe(() => exportDocument(editor.document, 'markdown', { schema })),
      );
    });
  }
});

describe('react: initial render (jsdom)', () => {
  for (const size of SIZES.filter((n) => n <= 10000)) {
    it(`${size} blocks`, () => {
      record('React render (jsdom)', size, renderTime(load(snapshotOf(size))));
    });
  }
});

/*
 * Виртуальный рендерер (`<DocumentView renderer="virtual">`): в DOM только окно около видимой области.
 * В jsdom нет раскладки, поэтому высоты — оценки, а окно — первые ~2000 px документа.
 */
describe('react: virtual renderer (jsdom)', () => {
  for (const size of SIZES.filter((n) => n <= 50000)) {
    it(`${size} blocks`, () => {
      const editor = load(snapshotOf(size));
      const { ms, mounted } = mount(editor, 'virtual');
      const middle = `b${Math.floor(size / 2)}`;

      record('virtual: render', size, ms, {
        domBlocks: mounted.container.querySelectorAll('[data-block-id]').length,
      });
      record(
        'virtual: typing in a rendered block ×200',
        size,
        safe(() => {
          for (let i = 0; i < 200; i++)
            flushSync(() =>
              editor.dispatch({
                type: 'replaceText',
                payload: { blockId: 'b1', from: i, to: i, text: 'x' },
              }),
            );
        }),
      );
      record(
        'virtual: insertBlock in a rendered block ×100',
        size,
        safe(() => {
          for (let i = 0; i < 100; i++)
            flushSync(() =>
              editor.dispatch({
                type: 'insertBlock',
                payload: { flavour: 'block:paragraph', afterId: 'b1' },
              }),
            );
        }),
      );
      record(
        'virtual: typing outside the window ×200',
        size,
        safe(() => {
          for (let i = 0; i < 200; i++)
            flushSync(() =>
              editor.dispatch({
                type: 'replaceText',
                payload: { blockId: middle, from: i, to: i, text: 'x' },
              }),
            );
        }),
      );

      mounted.unmount();
    });
  }
});

describe('one block with 500 000 characters', () => {
  it('typing and formatting', () => {
    const text = 'lorem ipsum '.repeat(Math.ceil(500_000 / 12));
    const editor = load(snapshotOf(1, { text: () => text }));
    const middle = Math.floor(text.length / 2);

    record(
      '500k chars: load',
      text.length,
      time(() => load(snapshotOf(1, { text: () => text }))).ms,
    );
    record(
      '500k chars: typing ×200',
      text.length,
      safe(() => {
        for (let i = 0; i < 200; i++)
          editor.dispatch({
            type: 'replaceText',
            payload: { blockId: 'b0', from: middle + i, to: middle + i, text: 'x' },
          });
      }),
    );
    record(
      '500k chars: bold ranges ×50',
      text.length,
      safe(() => {
        for (let i = 0; i < 50; i++)
          editor.dispatch({
            type: 'toggleFormatRange',
            payload: {
              from: { blockId: 'b0', offset: i * 1000 },
              to: { blockId: 'b0', offset: i * 1000 + 500 },
              format: 'bold',
            },
          });
      }),
    );
    record('500k chars: React render', text.length, renderTime(editor));
  });
});

describe('10 000 nested blocks', () => {
  it('deep chain of list items', () => {
    const snapshot = snapshotOf(10_000, { nested: true });
    let editor: Editor | undefined;

    record(
      'nested: validateSnapshot',
      10_000,
      safe(() => validateSnapshot(snapshot, schema)),
    );
    record(
      'nested: load',
      10_000,
      safe(() => (editor = load(snapshot))),
    );

    if (!editor) return;

    const ed = editor;

    record(
      'nested: full traversal',
      10_000,
      safe(() => traverse(ed)),
    );
    record(
      'nested: serialize',
      10_000,
      safe(() => serializeDocument(ed.document)),
    );
    record(
      'nested: typing in the deepest ×100',
      10_000,
      safe(() => {
        for (let i = 0; i < 100; i++)
          ed.dispatch({
            type: 'replaceText',
            payload: { blockId: 'b9999', from: 0, to: 0, text: 'x' },
          });
      }),
    );
    record(
      'nested: outdent the deepest',
      10_000,
      safe(() => ed.dispatch({ type: 'outdentBlock', payload: { blockId: 'b9999' } })),
    );
  });

  /*
   * Экспорт в Markdown и отрисовка — на предельной глубине (MAX_NESTING_DEPTH). При 10 000 уровней отступы
   * Markdown сами весят ~150 МБ, а DOM такой глубины упирается в стек браузера; редактор глубже предела не
   * вкладывает (Tab и перенос отклоняются).
   */
  it(`chain at the nesting limit (${MAX_NESTING_DEPTH} levels)`, () => {
    const ed = load(snapshotOf(MAX_NESTING_DEPTH - 1, { nested: true }));

    record(
      'nested at limit: export markdown',
      MAX_NESTING_DEPTH,
      safe(() => exportDocument(ed.document, 'markdown', { schema })),
    );
    record('nested at limit: React render', MAX_NESTING_DEPTH, renderTime(ed));
  });
});

afterAll(() => {
  // eslint-disable-next-line no-console -- итог замеров печатается таблицей
  console.table(rows);
});
