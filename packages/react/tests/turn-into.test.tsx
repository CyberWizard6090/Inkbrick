import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { tableBlocks } from '../src';
import { mountEditor } from './harness';

// Выделению нужна ненулевая геометрия: иначе toolbar считает, что показывать нечего.
const original = Range.prototype.getBoundingClientRect;

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 60, 18);
});

afterEach(() => {
  Range.prototype.getBoundingClientRect = original;
  cleanup();
});

const toolbar = () => document.querySelector<HTMLElement>('[data-testid="toolbar"]');
const turn = () => toolbar()?.querySelector<HTMLElement>('[data-format="turn-into"]') ?? null;
const options = () => [
  ...document.querySelectorAll<HTMLElement>('[data-inkbrick-part="turn-option"]'),
];

describe('turn into in the toolbar', () => {
  it('shows the type of the block and the types it can become', () => {
    const { ids, select } = mountEditor(['change me'], { formatting: 'toolbar' });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 6 });

    expect(turn()?.textContent).toContain('Text');

    fireEvent.click(turn()!);

    const titles = options().map((option) => option.textContent);

    expect(titles).toContain('Heading 1');
    expect(titles).toContain('Quote');
    expect(options().find((option) => option.dataset.active)?.textContent).toBe('Text');
  });

  it('turns the block into the chosen type and keeps the selection on the text', () => {
    const { editor, ids, select } = mountEditor(['change me'], { formatting: 'toolbar' });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 6 });
    fireEvent.click(turn()!);

    act(() => {
      fireEvent.click(options().find((option) => option.dataset.action === 'heading-2')!);
    });

    const block = editor.document.getBlock(ids[0])!;

    expect(block.flavour).toBe('block:heading');
    expect(block.props.level).toBe(2);
    expect(getSelection()!.toString()).toBe('change');
  });

  it('is one undo step', () => {
    const { editor, ids, select } = mountEditor(['change me'], { formatting: 'toolbar' });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 6 });
    fireEvent.click(turn()!);
    act(() => {
      fireEvent.click(options().find((option) => option.dataset.action === 'quote')!);
    });
    expect(editor.document.getBlock(ids[0])!.flavour).toBe('block:quote');

    act(() => editor.store.undo());
    expect(editor.document.getBlock(ids[0])!.flavour).toBe('block:paragraph');
  });

  it('is not offered for a selection across several blocks', () => {
    const { ids, select } = mountEditor(['one', 'two'], { formatting: 'toolbar' });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[1], offset: 2 });

    expect(toolbar()).not.toBeNull();
    expect(turn()).toBeNull();
  });

  it('does not list types the block cannot become: a table cell has none', () => {
    const { editor, ids, select } = mountEditor(['x'], {
      formatting: 'toolbar',
      blocks: tableBlocks,
    });

    act(() => {
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: ids[0] },
      });
    });

    const cell = Object.values(editor.document.dump()).find(
      (block) => block.flavour === 'block:table-cell',
    )!.id;

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: cell, from: 0, to: 0, text: 'ab' },
      });
    });
    select({ blockId: cell, offset: 0 }, { blockId: cell, offset: 2 });

    expect(toolbar()).not.toBeNull();
    expect(turn()).toBeNull();
  });
});
