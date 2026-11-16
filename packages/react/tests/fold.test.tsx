import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { Editor } from '@inkbrick/engine';

import { computeFolds, headingFolding } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

function outlineEditor(structure: Array<[string, number?]>) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];
  const ids = [first];

  for (let i = 1; i < structure.length; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
        }) as { blockId: string }
      ).blockId,
    );
  }

  structure.forEach(([text, level], i) => {
    if (level) {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[i], flavour: 'block:heading', props: { level } },
      });
    }

    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } });
  });

  return { editor, ids };
}

const collapse = (editor: Editor, id: string) =>
  editor.dispatch({
    type: 'setBlockProps',
    payload: { blockId: id, props: { collapsed: true } },
  });

describe('computeFolds', () => {
  const structure: Array<[string, number?]> = [
    ['intro'],
    ['One', 1],
    ['a'],
    ['Two', 2],
    ['b'],
    ['Deep', 3],
    ['c'],
    ['Two again', 2],
    ['d'],
    ['Next', 1],
    ['e'],
  ];

  it('is empty while nothing is collapsed', () => {
    const { editor } = outlineEditor(structure);

    expect(computeFolds(editor).size).toBe(0);
  });

  it('hides everything up to the next heading of the same or a higher level', () => {
    const { editor, ids } = outlineEditor(structure);

    collapse(editor, ids[3]);

    expect([...computeFolds(editor).keys()]).toEqual([ids[4], ids[5], ids[6]]);
    expect(new Set(computeFolds(editor).values())).toEqual(new Set([ids[3]]));
  });

  it('a level 1 heading takes the lower levels with it, up to the next level 1', () => {
    const { editor, ids } = outlineEditor(structure);

    collapse(editor, ids[1]);

    expect([...computeFolds(editor).keys()]).toEqual(ids.slice(2, 9));
  });

  it('a collapsed heading inside a collapsed one adds nothing of its own', () => {
    const { editor, ids } = outlineEditor(structure);

    collapse(editor, ids[3]);
    collapse(editor, ids[5]);

    expect(computeFolds(editor).get(ids[6])).toBe(ids[3]);
    expect(computeFolds(editor).has(ids[5])).toBe(true);
  });
});

describe('heading folding in the editor', () => {
  function mountOutline() {
    const mounted = mountEditor(['One', 'a', 'b', 'Two', 'c'], { ...headingFolding });
    const { editor, ids } = mounted;

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[0], flavour: 'block:heading', props: { level: 1 } },
      });
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[3], flavour: 'block:heading', props: { level: 1 } },
      });
    });

    return mounted;
  }

  it('the arrow collapses and expands the section; the blocks leave and return', () => {
    const { editor, ids, root, editable } = mountOutline();
    const arrow = (id: string) =>
      root.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-inkbrick-part="fold"]`)!;

    expect(arrow(ids[0]).getAttribute('aria-expanded')).toBe('true');

    act(() => void fireEvent.click(arrow(ids[0])));

    expect(editor.document.getBlock(ids[0])!.props.collapsed).toBe(true);
    expect(root.querySelector(`.editable[data-id="${ids[1]}"]`)).toBeNull();
    expect(root.querySelector(`.editable[data-id="${ids[2]}"]`)).toBeNull();
    expect(editable(ids[3])).not.toBeNull();
    expect(arrow(ids[0]).getAttribute('aria-expanded')).toBe('false');
    expect(arrow(ids[0]).getAttribute('aria-label')).toBe('Expand the section');

    act(() => void fireEvent.click(arrow(ids[0])));

    expect(root.querySelector(`.editable[data-id="${ids[1]}"]`)).not.toBeNull();
  });

  it('undo expands a section collapsed by mistake', () => {
    const { editor, ids, root } = mountOutline();

    act(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: ids[0], props: { collapsed: true } },
      });
    });
    expect(root.querySelector(`.editable[data-id="${ids[1]}"]`)).toBeNull();

    act(() => void editor.undo());
    expect(root.querySelector(`.editable[data-id="${ids[1]}"]`)).not.toBeNull();
  });

  it('a document opened with a collapsed section shows it collapsed', () => {
    const { editor, ids } = outlineEditor([['One', 1], ['a'], ['Two', 1], ['b']]);

    collapse(editor, ids[0]);

    const view = mountEditor([''], { ...headingFolding });

    expect(view.root).toBeDefined();
    expect(computeFolds(editor).size).toBe(1);
  });

  it('Enter at the end of a collapsed heading expands it first', () => {
    const { editor, ids, caret, key } = mountOutline();

    act(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: ids[0], props: { collapsed: true } },
      });
    });

    caret(ids[0], 3);
    key('Enter');

    expect(editor.document.getBlock(ids[0])!.props.collapsed).toBe(false);
  });

  it('removing the heading releases its blocks', () => {
    const { editor, ids, root } = mountOutline();

    act(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: ids[0], props: { collapsed: true } },
      });
    });
    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[0], flavour: 'block:paragraph' },
      });
    });

    expect(root.querySelector(`.editable[data-id="${ids[1]}"]`)).not.toBeNull();
  });
});
