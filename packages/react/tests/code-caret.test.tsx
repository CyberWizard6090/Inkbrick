import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { mountEditor } from './harness';

afterEach(cleanup);

describe('the caret in a code block survives a redraw that changes no text', () => {
  it('stays where it was when the language (hence the highlighting) changes', () => {
    const { editor, ids, caret, root } = mountEditor(['let abc = 1;'], {
      // Подсвечивает слово «let» только для javascript: смена языка меняет раскраску, текст остаётся.
      highlighter: (_text, language) =>
        language === 'javascript' ? [{ from: 0, to: 3, type: 'keyword' }] : [],
    });

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[0], flavour: 'block:code', props: {} },
      });
    });
    root.focus();
    caret(ids[0], 7);

    act(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: ids[0], props: { language: 'javascript' } },
      });
    });

    const selection = getSelection()!;
    const editable = root.querySelector(`.editable[data-id="${ids[0]}"]`)!;

    expect(editable.querySelector('[data-inkbrick-token]')).not.toBeNull();
    expect(editable.contains(selection.anchorNode)).toBe(true);

    const range = document.createRange();

    range.selectNodeContents(editable);
    range.setEnd(selection.anchorNode!, selection.anchorOffset);
    expect(range.toString().length).toBe(7);
  });

  it('is not moved when the text itself changes (the one who changed it places the caret)', () => {
    const { ids, caret, root, type } = mountEditor(['ab']);

    root.focus();
    caret(ids[0], 2);
    type('c');

    const editable = root.querySelector(`.editable[data-id="${ids[0]}"]`)!;

    expect(editable.textContent).toBe('abc');
  });
});
