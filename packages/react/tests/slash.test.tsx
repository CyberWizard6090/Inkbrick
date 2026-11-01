// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor } from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  defaultSlashItems,
  filterSlashItems,
  type SlashMenuItem,
} from '../src';
import { availableSlashItems, visibleSlashItems } from '../src/slash/items';
import { resolveSlashItems } from '../src/slash/defaultSlashItems';
import { SlashMenuController } from '../src/slash/SlashMenuController';

const titles = (items: readonly SlashMenuItem[]) => items.map((i) => i.id);

describe('filterSlashItems', () => {
  it('returns everything for an empty query, preserving order', () => {
    expect(titles(filterSlashItems(defaultSlashItems, ''))).toEqual(titles(defaultSlashItems));
    expect(titles(filterSlashItems(defaultSlashItems, '   '))).toEqual(titles(defaultSlashItems));
  });

  it('matches titles, keywords and ids case-insensitively', () => {
    expect(titles(filterSlashItems(defaultSlashItems, 'HEAD'))).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'heading-4',
      'heading-5',
      'heading-6',
    ]);
    expect(titles(filterSlashItems(defaultSlashItems, 'hr'))).toEqual(['divider']);
    expect(titles(filterSlashItems(defaultSlashItems, 'checkbox'))).toEqual(['todo-list']);
  });

  it('ranks title prefixes above weaker matches', () => {
    const result = titles(filterSlashItems(defaultSlashItems, 'quo'));

    expect(result[0]).toBe('quote');
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSlashItems(defaultSlashItems, 'zzzz')).toEqual([]);
  });
});

describe('resolveSlashItems', () => {
  const custom: SlashMenuItem = { id: 'widget', title: 'Widget', flavour: 'block:widget' };

  it('uses defaults when nothing is passed', () => {
    expect(resolveSlashItems(undefined)).toBe(defaultSlashItems);
    expect(resolveSlashItems([])).toBe(defaultSlashItems);
  });

  it('appends custom items and lets an item with the same id replace a default', () => {
    const replaced: SlashMenuItem = { id: 'quote', title: 'Pull quote', flavour: 'block:quote' };
    const result = resolveSlashItems([custom, replaced]);

    expect(result.at(-1)).toBe(custom);
    expect(result.find((i) => i.id === 'quote')).toBe(replaced);
    expect(result.length).toBe(defaultSlashItems.length + 1);
  });

  it('false disables the menu', () => {
    expect(resolveSlashItems(false)).toEqual([]);
  });
});

describe('availableSlashItems', () => {
  it('offers only registered blocks that are valid inside the parent', () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];
    const custom: SlashMenuItem = { id: 'widget', title: 'Widget', flavour: 'block:widget' };

    const items = availableSlashItems(editor, [...defaultSlashItems, custom], first);

    expect(titles(items)).toEqual(titles(defaultSlashItems)); // widget не зарегистрирован — не предлагается
    expect(visibleSlashItems(editor, defaultSlashItems, first, 'code').map((i) => i.id)).toEqual([
      'code',
    ]);
  });

  it('is empty for blocks without a parent', () => {
    const editor = new Editor();

    expect(availableSlashItems(editor, defaultSlashItems, editor.document.rootId)).toEqual([]);
  });
});

describe('SlashMenuController', () => {
  it('opens, updates, wraps the active item and closes', () => {
    const c = new SlashMenuController();
    let notified = 0;
    c.subscribe(() => notified++);

    c.open('b1', 3);
    expect(c.getState()).toMatchObject({
      open: true,
      blockId: 'b1',
      slashOffset: 3,
      query: '',
      activeIndex: 0,
    });

    c.move(-1, 4);
    expect(c.getState().activeIndex).toBe(3);
    c.move(1, 4);
    expect(c.getState().activeIndex).toBe(0);

    const before = c.getState();
    c.update({ query: '' }); // без изменений — без уведомления
    expect(c.getState()).toBe(before);

    c.close();
    expect(c.getState().open).toBe(false);
    c.update({ query: 'x' }); // закрыто — игнорируется
    expect(c.getState().query).toBe('');
    expect(notified).toBeGreaterThan(0);
  });
});

describe('rendering', () => {
  it('renders the new blocks and no menu until it is opened', () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    const q = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:quote', afterId: first },
    }) as { blockId: string };
    const c = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:code', afterId: q.blockId, props: { language: 'ts' } },
    }) as { blockId: string };
    editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:divider', afterId: c.blockId },
    });

    const html = renderToString(
      <EditorProvider editor={editor}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain('block-quote');
    expect(html).toContain('block-code');
    expect(html).toContain('data-language="ts"');
    expect(html).toContain('block-divider');
    expect(html).not.toContain('inkbrick-slash-menu');
  });
});
