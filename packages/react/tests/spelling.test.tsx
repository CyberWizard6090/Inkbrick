import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';

import { wordAt } from '@inkbrick/view';
import { mountEditor } from './harness';

describe('wordAt', () => {
  it('finds the word around an offset, with an inner apostrophe or hyphen', () => {
    expect(wordAt('one ошебка two', 6)).toEqual({ from: 4, to: 10, word: 'ошебка' });
    expect(wordAt('one ошебка two', 10)).toEqual({ from: 4, to: 10, word: 'ошебка' });
    expect(wordAt("don't stop", 2)!.word).toBe("don't");
    expect(wordAt('из-за угла', 1)!.word).toBe('из-за');
    expect(wordAt('a, b', 1)!.word).toBe('a');
    expect(wordAt('  12  ', 3)).toBeNull();
  });
});

describe('spelling suggestions in the context menu', () => {
  const menu = () => document.querySelector<HTMLElement>('[data-testid="context-menu"]');
  const item = (id: string) => menu()?.querySelector<HTMLElement>(`[data-action="${id}"]`) ?? null;

  function open(checker: {
    suggest: (word: string) => Promise<readonly string[] | null>;
    add?: (word: string) => void;
  }) {
    const mounted = mountEditor(['one ошебка two'], { spellcheck: { checker } });
    const target = mounted.editable(mounted.ids[0]);
    const text = target.firstChild!;

    // В jsdom нет caretPositionFromPoint: подставляем точку внутри слова.
    (document as unknown as { caretRangeFromPoint: unknown }).caretRangeFromPoint = () => {
      const range = document.createRange();

      range.setStart(text, 6);

      return range;
    };

    mounted.caret(mounted.ids[0], 6);
    fireEvent.contextMenu(target, { clientX: 40, clientY: 10 });

    return mounted;
  }

  it('shows the suggestions above Cut; picking one replaces the word', async () => {
    const checker = { suggest: vi.fn(async () => ['ошибка', 'ошибки']), add: vi.fn() };
    const { editor, ids } = open(checker);

    await waitFor(() => expect(checker.suggest).toHaveBeenCalledWith('ошебка'));
    await waitFor(() => expect(item('spelling-0')?.textContent).toBe('ошибка'));

    const actions = [...menu()!.querySelectorAll('[data-action]')].map((node) =>
      node.getAttribute('data-action'),
    );

    expect(actions.slice(0, 4)).toEqual(['spelling-0', 'spelling-1', 'spelling-add', 'cut']);

    act(() => void fireEvent.click(item('spelling-0')!));
    expect(editor.document.getBlock(ids[0])!.content).toEqual([{ insert: 'one ошибка two' }]);
    expect(menu()).toBeNull();
  });

  it('a correct word adds nothing; «Add to dictionary» passes the word on', async () => {
    const correct = { suggest: vi.fn(async () => null) };

    open(correct);
    await waitFor(() => expect(correct.suggest).toHaveBeenCalled());
    await waitFor(() => expect(item('spelling-loading')).toBeNull());
    expect(menu()!.querySelector('[data-action^="spelling"]')).toBeNull();
  });

  it('«Add to dictionary» passes the word to the checker', async () => {
    const checker = { suggest: vi.fn(async () => []), add: vi.fn() };

    open(checker);
    await waitFor(() => expect(item('spelling-none')).not.toBeNull());
    act(() => void fireEvent.click(item('spelling-add')!));
    expect(checker.add).toHaveBeenCalledWith('ошебка');
  });
});
