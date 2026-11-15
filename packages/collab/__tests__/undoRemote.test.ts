import { describe, expect, it } from 'vitest';

import { createPeer, createServerState, firstParagraph, syncAll, text, type Peer } from './harness';

const contents = (peer: Peer): string[] =>
  Object.keys(peer.editor.document.dump())
    .map((id) => text(peer, id))
    .filter((value) => value !== '')
    .sort();

/** `a` пишет «hello world» и делит блок, `b` печатает `typed` в начало второй части. */
function splitAndType(typed: string): { a: Peer; b: Peer; id: string; second: string } {
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
    payload: { text: typed, selection: { anchor: { blockId: second, offset: 0 } } },
  });
  syncAll([a, b]);

  return { a, b, id, second };
}

describe('undo with remote edits', () => {
  it('keeps the text another person typed into a block the undo removes', () => {
    const { a, b, id } = splitAndType('XYZ');

    a.collab.history.undo();
    syncAll([a, b]);

    // The split is undone; the other person's text is not lost. It is added to the end of the block that took
    // the text back, because where inside the removed block it stood cannot be told any more.
    expect(text(a, id)).toBe('hello worldXYZ');
    expect(contents(a)).toEqual(['hello worldXYZ']);
    expect(contents(b)).toEqual(contents(a));
    expect(a.collab.inSync() && b.collab.inSync()).toBe(true);
  });

  it('works with Cyrillic and emoji', () => {
    const { a, b, id } = splitAndType('привет 🙂');

    a.collab.history.undo();
    syncAll([a, b]);

    expect(text(a, id)).toBe('hello worldпривет 🙂');
    expect(contents(b)).toEqual(contents(a));
  });

  it('adds nothing when nobody else typed in the removed block', () => {
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
    a.collab.history.undo();
    syncAll([a, b]);

    expect(contents(a)).toEqual(['hello world']);
    expect(contents(b)).toEqual(['hello world']);
  });

  it('redo after the rescue does not bring the text back twice', () => {
    const { a, b } = splitAndType('XYZ');

    a.collab.history.undo();
    a.collab.history.redo();
    syncAll([a, b]);

    // The block is back with the text, the copy added at its place is gone.
    expect(contents(a)).toEqual(['XYZ world', 'hello']);
    expect(contents(b)).toEqual(contents(a));
    expect(a.collab.inSync() && b.collab.inSync()).toBe(true);
  });
});
