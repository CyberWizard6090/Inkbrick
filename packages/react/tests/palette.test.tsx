import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import {
  CommandPalette,
  commandPalette,
  findReplace,
  useCommandPalette,
  type PaletteCommand,
} from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

function mountPalette(
  texts: string[],
  commands: readonly PaletteCommand[] = [],
  options: { readOnly?: boolean; builtin?: boolean } = {},
) {
  const mounted = mountEditor(texts, {
    keymap: [...commandPalette.keymap, ...findReplace.keymap],
    readOnly: options.readOnly,
    extra: <CommandPalette commands={commands} builtin={options.builtin} />,
  });

  const palette = () => document.querySelector<HTMLElement>('[data-testid="command-palette"]');
  const input = () => palette()!.querySelector<HTMLInputElement>('[data-inkbrick-part="query"]')!;
  const options_ = () => [
    ...palette()!.querySelectorAll<HTMLElement>('[data-inkbrick-part="option"]'),
  ];
  const titles = () => options_().map((option) => option.dataset.command!);
  const open = () => mounted.key('p', { ctrl: true, shift: true });
  const search = (value: string) => fireEvent.change(input(), { target: { value } });

  return { ...mounted, palette, input, titles, options: options_, open, search };
}

/** В режиме только чтения клавиши редактора не работают: палитру открываем из кода. */
function OpenPalette() {
  const { controller } = useCommandPalette();

  useEffect(() => {
    controller.open();
  }, [controller]);

  return null;
}

function mountReadOnly(commands: readonly PaletteCommand[]) {
  const mounted = mountEditor(['text'], {
    readOnly: true,
    extra: (
      <>
        <CommandPalette commands={commands} />
        <OpenPalette />
      </>
    ),
  });
  const palette = () => document.querySelector<HTMLElement>('[data-testid="command-palette"]')!;

  return {
    ...mounted,
    titles: () =>
      [...palette().querySelectorAll<HTMLElement>('[data-inkbrick-part="option"]')].map(
        (option) => option.dataset.command!,
      ),
    search: (value: string) =>
      fireEvent.change(palette().querySelector('input')!, { target: { value } }),
  };
}

const sample = (run = vi.fn()): PaletteCommand => ({
  id: 'app.save',
  title: 'Save document',
  group: 'App',
  keywords: ['store'],
  shortcut: 'Mod-S',
  run,
});

describe('command palette', () => {
  it('is closed until Ctrl+Shift+P and closes on a second press and on Escape', () => {
    const { palette, open, input } = mountPalette(['text']);

    expect(palette()).toBeNull();

    open();
    expect(palette()).not.toBeNull();

    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(palette()).toBeNull();
  });

  it('is a combobox over a listbox with a named dialog', () => {
    const { open, input, palette } = mountPalette(['text'], [sample()]);

    open();

    expect(palette()!.getAttribute('role')).toBe('dialog');
    expect(input().getAttribute('role')).toBe('combobox');
    expect(palette()!.querySelector('[role="listbox"]')!.id).toBe(
      input().getAttribute('aria-controls'),
    );
    expect(document.activeElement).toBe(input());
  });

  it('lists app commands in their group and filters by title and keywords', () => {
    const { open, titles, search, caret, ids } = mountPalette(['text'], [sample()]);

    caret(ids[0], 0);
    open();
    expect(titles()).toContain('app.save');

    search('store');
    expect(titles()).toEqual(['app.save']);

    search('SAVE d');
    expect(titles()).toEqual(['app.save']);

    search('zzzz');
    expect(titles()).toEqual([]);
  });

  it('Enter runs the active command after closing and returning the selection to the document', () => {
    const run = vi.fn();
    const { open, input, palette, search, select, ids } = mountPalette(
      ['hello world'],
      [sample(run)],
    );

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 5 });
    open();
    search('save');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].selection.from).toEqual({ blockId: ids[0], offset: 0 });
    expect(palette()).toBeNull();
    expect(getSelection()!.toString()).toBe('hello');
  });

  it('arrow keys move the active option and wrap around', () => {
    const second: PaletteCommand = { id: 'app.two', title: 'Second', run: vi.fn() };
    const { open, input, options } = mountPalette(['x'], [sample(), second], { builtin: false });

    open();
    const selected = () => options().findIndex((o) => o.getAttribute('aria-selected') === 'true');

    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(selected()).toBe(1);
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1].id);
  });

  it('applies formatting to the selection captured at opening', () => {
    const { open, search, input, editor, ids, select } = mountPalette(['hello world']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 5 });
    open();
    search('bold');
    fireEvent.keyDown(input(), { key: 'Enter' });

    const content = editor.document.getBlock(ids[0])!.content;

    expect(content[0]).toMatchObject({ insert: 'hello', attributes: { bold: true } });
  });

  it('hides formatting without a selection and turns the current block into another', () => {
    const { open, titles, search, input, editor, ids, caret } = mountPalette(['text']);

    caret(ids[0], 2);
    open();
    expect(titles()).not.toContain('format.bold');

    search('heading 1');
    expect(titles()[0]).toBe('turn.heading-1');

    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(editor.document.getBlock(ids[0])!.flavour).toBe('block:heading');
  });

  it('inserts a new block after the current one', () => {
    const { open, search, input, editor, ids, caret } = mountPalette(['one', 'two']);

    caret(ids[0], 1);
    open();
    search('insert: divider');
    fireEvent.keyDown(input(), { key: 'Enter' });

    const parent = editor.document.getBlock(editor.document.getBlock(ids[0])!.parentId!)!;

    expect(editor.document.getBlock(parent.children[1])!.flavour).toBe('block:divider');
    expect(parent.children[2]).toBe(ids[1]);
  });

  it('undo and redo appear only when they can run', () => {
    const { open, titles, search, input, editor, ids, caret } = mountPalette(['a']);

    caret(ids[0], 0);
    open();
    expect(titles()).not.toContain('history.undo');
    fireEvent.keyDown(input(), { key: 'Escape' });

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[0], from: 1, to: 1, text: 'b' },
      });
    });
    open();
    expect(titles()).toContain('history.undo');

    search('undo');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(
      editor.document
        .getBlock(ids[0])!
        .content.map((n) => n.insert)
        .join(''),
    ).toBe('a');
  });

  it('read-only hides everything that changes the document', () => {
    const { titles, search } = mountReadOnly([sample()]);

    expect(titles()).toEqual(['app.save']);
    search('bold');
    expect(titles()).toEqual([]);
  });

  it('an app command with the same id replaces the built-in one', () => {
    const replaced: PaletteCommand = { id: 'history.undo', title: 'My undo', run: vi.fn() };
    const { open, options } = mountPalette(['a'], [replaced]);

    open();

    expect(options().filter((o) => o.dataset.command === 'history.undo')).toHaveLength(1);
    expect(options().find((o) => o.dataset.command === 'history.undo')!.textContent).toContain(
      'My undo',
    );
  });

  it('lists Find from findReplace.commands', () => {
    const { open, titles } = mountPalette(['a'], findReplace.commands);

    open();
    expect(titles()).toEqual(expect.arrayContaining(['find.open', 'find.replace']));
  });
});
