import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider } from '../src';
import { mapOffset } from '../src/editing/preserveSelection';
import { getOffsetIn } from '../src/editing/selection';

globalThis.CSS ??= {} as typeof CSS;
CSS.escape ??= (value: string) => value.replace(/["\\]/g, '\\$&');

describe('mapOffset', () => {
  it('keeps a position before the change and moves one after it', () => {
    expect(mapOffset('hello world', 'XXhello world', 0)).toBe(0);
    expect(mapOffset('hello world', 'XXhello world', 5)).toBe(7);
    expect(mapOffset('hello world', 'hello brave world', 3)).toBe(3);
    expect(mapOffset('hello world', 'hello brave world', 9)).toBe(15);
    expect(mapOffset('hello world', 'hello', 11)).toBe(5);
  });

  it('puts a position inside replaced text after the new text', () => {
    expect(mapOffset('abcdef', 'abXYef', 3)).toBe(4);
    expect(mapOffset('abcdef', 'abXYef', 2)).toBe(2);
  });

  it('leaves a position at the edge of an insertion before it', () => {
    expect(mapOffset('ab', 'aXb', 1)).toBe(1);
  });

  it('is the identity for equal texts and never negative', () => {
    expect(mapOffset('same', 'same', 2)).toBe(2);
    expect(mapOffset('abc', '', 3)).toBe(0);
  });
});

function setup(text: string) {
  const editor = new Editor();
  const doc = editor.document;
  const noteId = doc.getBlock(doc.rootId)!.children[0];
  const id = doc.getBlock(noteId)!.children[0];

  editor.dispatch({ type: 'replaceText', payload: { blockId: id, from: 0, to: 0, text } });

  const view = render(
    <EditorProvider editor={editor} formulaRenderer={false} highlighter={false}>
      <DocumentView />
    </EditorProvider>,
  );
  const element = view.container.querySelector<HTMLElement>(`.editable[data-id="${id}"]`)!;

  return { editor, id, element };
}

/** Isolates a change that arrives from outside (another person), as the collaboration bridge applies it. */
function remote(editor: Editor, id: string, content: string): void {
  act(() => {
    editor.store.transact(
      (transaction) => {
        editor.engine.block.update(transaction, id, (block) => ({
          ...block,
          content: [{ insert: content }],
        }));
      },
      { history: false },
    );
  });
}

const caret = (element: HTMLElement): { anchor: number; focus: number } => {
  const selection = getSelection()!;

  return {
    anchor: getOffsetIn(element, selection.anchorNode!, selection.anchorOffset),
    focus: getOffsetIn(element, selection.focusNode!, selection.focusOffset),
  };
};

function select(element: HTMLElement, anchor: number, focus: number): void {
  const node = element.firstChild!;

  getSelection()!.setBaseAndExtent(node, anchor, node, focus);
}

describe('the caret during an edit of another person', () => {
  it('stays after the same words when text is added before it', () => {
    const { editor, id, element } = setup('начало середина конец');

    select(element, 5, 5);
    remote(editor, id, 'ДОБАВЛЕНО начало середина конец');

    expect(element.textContent).toBe('ДОБАВЛЕНО начало середина конец');
    expect(caret(element)).toEqual({ anchor: 15, focus: 15 });
  });

  it('does not move when text is added after it', () => {
    const { editor, id, element } = setup('начало середина конец');

    select(element, 5, 5);
    remote(editor, id, 'начало середина конец Z');

    expect(caret(element)).toEqual({ anchor: 5, focus: 5 });
  });

  it('keeps the direction and both ends of a selection', () => {
    const { editor, id, element } = setup('abcdefgh');

    select(element, 6, 2);
    remote(editor, id, '12abcdefgh');

    expect(caret(element)).toEqual({ anchor: 8, focus: 4 });
  });

  it('leaves the selection alone when the text did not change', () => {
    const { editor, id, element } = setup('abcdef');

    select(element, 3, 3);
    remote(editor, id, 'abcdef');

    expect(caret(element)).toEqual({ anchor: 3, focus: 3 });
  });

  it('does not take the caret into a block the caret is not in', () => {
    const { editor, id, element } = setup('first');
    let other = { blockId: '' };

    act(() => {
      other = editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: id },
      }) as { blockId: string };
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: other.blockId, from: 0, to: 0, text: 'second' },
      });
    });

    const second = element.ownerDocument.querySelector<HTMLElement>(
      `.editable[data-id="${other.blockId}"]`,
    )!;

    select(second, 3, 3);
    remote(editor, id, 'first changed');

    expect(getSelection()!.anchorNode).toBe(second.firstChild);
    expect(caret(second)).toEqual({ anchor: 3, focus: 3 });
  });
});
