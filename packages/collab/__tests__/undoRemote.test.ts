import { describe, expect, it } from 'vitest';

import { createPeer, createServerState, firstParagraph, syncAll, text } from './harness';

describe('undo with remote edits', () => {
  // Известное ограничение: undo разделения удаляет новый блок вместе с чужим текстом внутри него.
  // Тест помечен как падающий; когда ограничение снимут, `it.fails` нужно заменить на `it`.
  it.fails('split, remote typing into the new part, undo keeps the remote text', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'hello world', selection: { anchor: { blockId: id, offset: 0 } } },
    });
    syncAll([a, b]);
    a.collab.history.seal();
    a.editor.dispatch({ type: 'splitBlock', payload: { blockId: id, offset: 5 } });
    syncAll([a, b]);

    const note = a.editor.document.getBlock(
      a.editor.document.getBlock(a.editor.document.rootId)!.children[0],
    )!;
    const second = note.children[1];

    b.editor.dispatch({
      type: 'insertText',
      payload: { text: 'XYZ', selection: { anchor: { blockId: second, offset: 0 } } },
    });
    syncAll([a, b]);
    a.collab.history.undo();
    syncAll([a, b]);
    const all = Object.keys(a.editor.document.dump()).map((k) => text(a, k));
    expect(a.collab.inSync() && b.collab.inSync()).toBe(true);
    expect(all.join('|')).toContain('XYZ');
  });
});
