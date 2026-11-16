import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { FindReplacePanel, findMatches, findReplace, searchPattern, useFind } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

/** Открывает поиск из кода: в режиме только чтения клавиши редактора не работают. */
function OpenFind() {
  const { controller } = useFind();

  useEffect(() => {
    controller.open(true);
  }, [controller]);

  return null;
}

function mountFind(texts: string[], readOnly = false) {
  const mounted = mountEditor(texts, {
    keymap: findReplace.keymap,
    readOnly,
    extra: (
      <>
        <FindReplacePanel />
        {readOnly && <OpenFind />}
      </>
    ),
  });

  const panel = () => document.querySelector<HTMLElement>('[data-testid="find-panel"]');
  const part = (name: string) =>
    panel()!.querySelector<HTMLInputElement & HTMLButtonElement>(`[data-inkbrick-part="${name}"]`)!;

  return { ...mounted, panel, part };
}

describe('search', () => {
  it('finds every occurrence across blocks and ignores case by default', () => {
    const { editor } = mountFind(['Cat and cat', 'CATALOG', 'dog']);

    const matches = findMatches(editor, 'cat');

    expect(matches.map(({ from, to }) => [from, to])).toEqual([
      [0, 3],
      [8, 11],
      [0, 3],
    ]);
    expect(findMatches(editor, 'cat', { caseSensitive: true })).toHaveLength(1);
  });

  it('whole words skip matches inside other words', () => {
    const { editor } = mountFind(['cat catalog cat_x cat.']);

    expect(findMatches(editor, 'cat', { wholeWord: true }).map(({ from }) => from)).toEqual([
      0, 18,
    ]);
  });

  it('treats the query as plain text, not a pattern', () => {
    const { editor } = mountFind(['a.b a+b axb']);

    expect(findMatches(editor, 'a.b')).toHaveLength(1);
    expect(findMatches(editor, 'a+b')).toHaveLength(1);
    expect(searchPattern('')).toBeNull();
  });
});

describe('find and replace panel', () => {
  it('Ctrl+F opens it with the selected text and counts the matches', () => {
    const { select, key, panel, part, ids } = mountFind(['one two one', 'one']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 3 });
    key('f', { ctrl: true });

    expect(panel()).not.toBeNull();
    expect(part('query').value).toBe('one');
    expect(part('status').textContent).toBe('1 / 3');
  });

  it('Enter and Shift+Enter walk through the matches and wrap around', () => {
    const { key, part } = mountFind(['a b a', 'a']);

    key('f', { ctrl: true });
    fireEvent.change(part('query'), { target: { value: 'a' } });

    expect(part('status').textContent).toBe('1 / 3');

    fireEvent.keyDown(part('query'), { key: 'Enter' });
    expect(part('status').textContent).toBe('2 / 3');

    fireEvent.keyDown(part('query'), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(part('query'), { key: 'Enter', shiftKey: true });
    expect(part('status').textContent).toBe('3 / 3');
  });

  it('shows that nothing was found', () => {
    const { key, part } = mountFind(['abc']);

    key('f', { ctrl: true });
    fireEvent.change(part('query'), { target: { value: 'zzz' } });

    expect(part('status').textContent).toBe('No results');
    expect(part('next').disabled).toBe(true);
  });

  it('replaces the current match, then all of them in one undo step', () => {
    const { key, part, editor, ids } = mountFind(['cat cat', 'a cat']);
    const text = (id: string) =>
      editor.document
        .getBlock(id)!
        .content.map((node) => node.insert)
        .join('');

    key('h', { ctrl: true });
    fireEvent.change(part('query'), { target: { value: 'cat' } });
    fireEvent.change(part('replacement'), { target: { value: 'dog' } });

    fireEvent.click(part('replace'));
    expect(text(ids[0])).toBe('dog cat');
    expect(part('status').textContent).toBe('1 / 2');

    editor.clearHistory();
    fireEvent.click(part('replace-all'));

    expect(text(ids[0])).toBe('dog dog');
    expect(text(ids[1])).toBe('a dog');

    act(() => editor.store.undo());
    expect(text(ids[0])).toBe('dog cat');
    expect(text(ids[1])).toBe('a cat');
  });

  it('typing in the document keeps the count up to date', async () => {
    const { key, part, editor, ids } = mountFind(['one']);

    key('f', { ctrl: true });
    fireEvent.change(part('query'), { target: { value: 'one' } });
    expect(part('status').textContent).toBe('1 / 1');

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[0], from: 3, to: 3, text: ' one' },
      });
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(part('status').textContent).toBe('1 / 2');
  });

  it('Escape closes the panel and selects the current match', () => {
    const { key, part, panel, ids, editor } = mountFind(['say hello']);

    key('f', { ctrl: true });
    fireEvent.change(part('query'), { target: { value: 'hello' } });
    fireEvent.keyDown(part('query'), { key: 'Escape' });

    expect(panel()).toBeNull();
    expect(getSelection()!.toString()).toBe('hello');
    expect(editor.document.getBlock(ids[0])).toBeDefined();
  });

  it('a read-only document can be searched but has no replace controls', () => {
    const { part, panel } = mountFind(['abc abc'], true);

    fireEvent.change(part('query'), { target: { value: 'abc' } });

    expect(part('status').textContent).toBe('1 / 2');
    expect(panel()!.querySelector('[data-inkbrick-part="replacement"]')).toBeNull();
    expect(panel()!.querySelector('[data-inkbrick-part="replace-all"]')).toBeNull();
  });
});
