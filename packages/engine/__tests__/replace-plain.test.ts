import { describe, expect, it } from 'vitest';

import { Editor } from '../src/internal';

describe('replaceText plain', () => {
  it('inserts text without the formatting of the character on the left', () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const id = editor.document.getBlock(note)!.children[0];
    const insert = (text: string, plain?: boolean) =>
      editor.dispatch({
        type: 'replaceText',
        payload: {
          blockId: id,
          from: editor.engine.inline.length(editor.document.getBlock(id)!.content),
          to: editor.engine.inline.length(editor.document.getBlock(id)!.content),
          text,
          plain,
        },
      });

    insert('ab');
    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: { blockId: id, offset: 0 },
        to: { blockId: id, offset: 2 },
        attributes: { bold: true },
      },
    });

    insert('c');
    insert('d', true);

    expect(editor.document.getBlock(id)!.content).toEqual([
      { insert: 'abc', attributes: { bold: true } },
      { insert: 'd' },
    ]);
  });
});
