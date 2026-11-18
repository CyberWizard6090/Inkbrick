import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { headingFolding } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

/** One (h1) / a / b / Two (h1) / c: раздел One свёрнут, блок Two стоит сразу под скрытым «b». */
function mountFolded() {
  const mounted = mountEditor(['One', 'a', 'b', 'Two', 'c'], { ...headingFolding });
  const { editor, ids } = mounted;

  act(() => {
    for (const index of [0, 3]) {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[index], flavour: 'block:heading', props: { level: 1 } },
      });
    }
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: ids[0], props: { collapsed: true } },
    });
  });

  const text = (id: string) =>
    editor.engine.inline.toPlainText(editor.document.getBlock(id)!.content);

  return { ...mounted, text };
}

describe('Backspace and Delete next to a folded section', () => {
  it('Backspace at the start of the block under the section unfolds it and changes nothing else', () => {
    const t = mountFolded();

    t.caret(t.ids[3], 0);
    t.editor.clearHistory();
    t.key('Backspace');

    expect(t.editor.document.getBlock(t.ids[0])!.props.collapsed).toBeFalsy();
    // Ни слияния, ни превращения: «Two» остался заголовком, «b» цел.
    expect(t.text(t.ids[2])).toBe('b');
    expect(t.editor.document.getBlock(t.ids[3])!.flavour).toBe('block:heading');
    expect(t.text(t.ids[3])).toBe('Two');

    // Следующее нажатие работает как обычно (заголовок становится абзацем).
    t.key('Backspace');
    expect(t.editor.document.getBlock(t.ids[3])!.flavour).toBe('block:paragraph');
  });

  it('unfolding is one undo step', () => {
    const t = mountFolded();

    t.caret(t.ids[3], 0);
    t.editor.clearHistory();
    t.key('Backspace');
    act(() => t.editor.store.undo());

    expect(t.editor.document.getBlock(t.ids[0])!.props.collapsed).toBe(true);
  });

  it('Delete at the end of the folded heading unfolds the section instead of pulling a hidden block in', () => {
    const t = mountFolded();

    t.caret(t.ids[0], 3);
    t.key('Delete');

    expect(t.editor.document.getBlock(t.ids[0])!.props.collapsed).toBeFalsy();
    expect(t.text(t.ids[0])).toBe('One');
    expect(t.text(t.ids[1])).toBe('a');

    t.key('Delete');
    expect(t.text(t.ids[0])).toBe('Onea');
  });

  it('the same through beforeinput (browsers that send it)', () => {
    const t = mountFolded();

    t.caret(t.ids[3], 0);
    t.input('deleteContentBackward');

    expect(t.editor.document.getBlock(t.ids[0])!.props.collapsed).toBeFalsy();
    expect(t.text(t.ids[3])).toBe('Two');
  });

  it('merging next to an unfolded section is unchanged', () => {
    const t = mountFolded();

    act(() => {
      t.editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: t.ids[0], props: { collapsed: false } },
      });
    });
    t.caret(t.ids[2], 0);
    t.key('Backspace');

    expect(t.text(t.ids[1])).toBe('ab');
  });
});
