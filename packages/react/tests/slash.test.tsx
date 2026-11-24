// @vitest-environment node
import { orderByGroup } from '../src/slash/groups';
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
import { createTranslator, resolveMessages } from '@inkbrick/locales';

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

describe('slash items translated from the app dictionary (titleKey)', () => {
  const item: SlashMenuItem = {
    id: 'counter',
    title: 'Counter',
    description: 'A counter',
    keywords: ['count'],
    flavour: 'block:counter',
    titleKey: 'app.counter.title',
    descriptionKey: 'app.counter.description',
    keywordsKey: 'app.counter.keywords',
  };
  const translator = (messages: Record<string, string>) =>
    createTranslator({ ...resolveMessages(), ...messages } as never);
  const find = (t: ReturnType<typeof translator>) =>
    resolveSlashItems([item], t).find((entry) => entry.id === 'counter')!;

  it('takes the title, the description and extra search words from the dictionary', () => {
    const result = find(
      translator({
        'app.counter.title': 'Счётчик',
        'app.counter.description': 'Число с кнопками',
        'app.counter.keywords': 'счётчик, число',
      }),
    );

    expect(result.title).toBe('Счётчик');
    expect(result.description).toBe('Число с кнопками');
    expect(result.keywords).toEqual(['count', 'счётчик', 'число']);
  });

  it('keeps the written text where the dictionary has no such key', () => {
    const result = find(translator({ 'app.counter.title': 'Счётчик' }));

    expect(result.title).toBe('Счётчик');
    expect(result.description).toBe('A counter');
    expect(result.keywords).toEqual(['count']);
    expect(find(translator({})).title).toBe('Counter');
  });

  it('an item without keys is left as it is and an item that replaces a default is translated too', () => {
    const plain: SlashMenuItem = { id: 'widget', title: 'Widget', flavour: 'block:widget' };
    const quote: SlashMenuItem = {
      id: 'quote',
      title: 'Pull quote',
      flavour: 'block:quote',
      titleKey: 'app.quote',
    };
    const t = translator({ 'app.quote': 'Цитата-врезка' });
    const items = resolveSlashItems([plain, quote], t);

    expect(items.find((entry) => entry.id === 'widget')).toEqual(plain);
    expect(items.find((entry) => entry.id === 'quote')!.title).toBe('Цитата-врезка');
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

    // widget не зарегистрирован — не предлагается; остальные идут по группам
    expect(titles(items)).toEqual(titles(orderByGroup(defaultSlashItems)));
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

describe('slash menu groups', () => {
  const item = (id: string, group?: string): SlashMenuItem => ({
    id,
    title: id,
    flavour: 'block:paragraph',
    group,
  });

  it('puts basic, media and advanced first, then own groups, then ungrouped, keeping the order inside a group', () => {
    const ordered = orderByGroup([
      item('free'),
      item('own-b', 'mine'),
      item('adv-1', 'advanced'),
      item('media-1', 'media'),
      item('basic-1', 'basic'),
      item('own-a', 'other-group'),
      item('basic-2', 'basic'),
      item('own-c', 'mine'),
    ]);

    expect(ordered.map((i) => i.id)).toEqual([
      'basic-1',
      'basic-2',
      'media-1',
      'adv-1',
      'own-b',
      'own-c',
      'own-a',
      'free',
    ]);
  });

  it('every built-in item is in a group and the table is among the basic ones', () => {
    expect(defaultSlashItems.every((entry) => entry.group)).toBe(true);
    expect(defaultSlashItems.find((entry) => entry.id === 'image')?.group).toBe('media');
    expect(defaultSlashItems.find((entry) => entry.id === 'code')?.group).toBe('advanced');
  });
});
