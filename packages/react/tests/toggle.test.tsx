import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { toggleBlocks } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

function mountToggle(readOnly = false) {
  const mounted = mountEditor(['Title', 'after'], { blocks: toggleBlocks });
  const { editor, ids } = mounted;
  let child = '';

  act(() => {
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:toggle', props: {} },
    });
    child = (
      editor.dispatch({
        type: 'insertBlock',
        payload: {
          flavour: 'block:paragraph',
          parentId: ids[0],
          content: [{ insert: 'inside' }],
        },
      }) as { blockId: string }
    ).blockId;
    editor.clearHistory();
  });

  if (readOnly) act(() => editor.setReadOnly(true));

  const toggle = () => mounted.root.querySelector<HTMLElement>('[data-inkbrick-block="toggle"]')!;
  const button = () =>
    mounted.root.querySelector<HTMLButtonElement>('[data-inkbrick-part="toggle"]')!;

  return { ...mounted, child, toggle, button };
}

describe('toggle block', () => {
  it('shows the nested blocks while open and hides them when closed, undoably', () => {
    const { button, toggle, root, child, ids, editor } = mountToggle();

    expect(toggle().hasAttribute('data-open')).toBe(true);
    expect(root.querySelector(`.editable[data-id="${child}"]`)).not.toBeNull();

    fireEvent.click(button());

    expect(toggle().hasAttribute('data-open')).toBe(false);
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector(`.editable[data-id="${child}"]`)).toBeNull();
    expect(editor.document.getBlock(ids[0])!.props.open).toBe(false);

    act(() => editor.store.undo());

    expect(root.querySelector(`.editable[data-id="${child}"]`)).not.toBeNull();
  });

  it('Enter at the end of an open toggle makes a nested paragraph first', () => {
    const { caret, key, child, ids, editor } = mountToggle();

    caret(ids[0], 5);
    key('Enter');

    const children = editor.document.getBlock(ids[0])!.children;

    expect(children).toHaveLength(2);
    expect(children[1]).toBe(child);
    expect(editor.document.getBlock(children[0])!.flavour).toBe('block:paragraph');
  });

  it('Enter in the middle of the title splits it as usual', () => {
    const { caret, input, child, ids, editor } = mountToggle();

    caret(ids[0], 2);
    input('insertParagraph');

    const note = editor.document.getBlock(ids[0])!.parentId!;
    const siblings = editor.document.getBlock(note)!.children;

    expect(editor.document.getBlock(ids[0])!.children).toEqual([child]);
    expect(siblings).toHaveLength(3);
  });

  it('Enter in an empty last nested paragraph leaves the toggle', () => {
    const { caret, key, child, ids, editor } = mountToggle();

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: child, from: 0, to: 6, text: '' },
      });
    });
    caret(child, 0);
    key('Enter');

    const note = editor.document.getBlock(ids[0])!.parentId!;

    expect(editor.document.getBlock(ids[0])!.children).toEqual([]);
    expect(editor.document.getBlock(note)!.children.slice(0, 2)).toEqual([ids[0], child]);
  });

  it('in a read-only document the reader can open and close it without changing the document', () => {
    const { button, root, child, ids, editor } = mountToggle(true);

    expect(button().disabled).toBe(false);

    fireEvent.click(button());

    expect(root.querySelector(`.editable[data-id="${child}"]`)).toBeNull();
    expect(editor.document.getBlock(ids[0])!.props.open).toBeUndefined();

    fireEvent.click(button());

    expect(root.querySelector(`.editable[data-id="${child}"]`)).not.toBeNull();
  });

  it('pasted <details> becomes a toggle with its content nested', () => {
    const { caret, clipboard, ids, editor } = mountEditor([''], { blocks: toggleBlocks });

    caret(ids[0], 0);
    clipboard('paste', {
      'text/html': '<details><summary>Q</summary><p>A1</p><p>A2</p></details>',
    });

    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const toggle = editor.document
      .getBlock(note)!
      .children.map((id) => editor.document.getBlock(id)!)
      .find((block) => block.flavour === 'block:toggle')!;

    expect(toggle.content.map((node) => node.insert).join('')).toBe('Q');
    expect(toggle.props.open).toBe(false);
    expect(
      toggle.children.map((id) =>
        editor.document
          .getBlock(id)!
          .content.map((node) => node.insert)
          .join(''),
      ),
    ).toEqual(['A1', 'A2']);
  });

  it('without the toggle blocks the same paste keeps the text', () => {
    const { caret, clipboard, ids, editor } = mountEditor(['']);

    caret(ids[0], 0);
    clipboard('paste', {
      'text/html': '<details><summary>Q</summary><p>A1</p></details>',
    });

    const text = JSON.stringify(editor.document.getBlock(ids[0]));
    const all = JSON.stringify([...editor.document.getBlock(editor.document.rootId)!.children]);

    expect(text + all).not.toContain('block:toggle');
  });
});
