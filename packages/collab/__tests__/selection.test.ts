import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { cursorsOf, resolveSelection, shareSelection } from '../src';
import { createPeer, createServerState, firstParagraph, syncAll } from './harness';

function typed(text: string) {
  const state = createServerState();
  const a = createPeer('a', state);
  const b = createPeer('b', state);
  const id = firstParagraph(a);

  a.editor.dispatch({
    type: 'insertText',
    payload: { text, selection: { anchor: { blockId: id, offset: 0 } } },
  });
  syncAll([a, b]);

  return { a, b, id };
}

describe('shared selections', () => {
  it('keep their place between the same characters when others edit', () => {
    const { a, b, id } = typed('abcdef');
    const shared = shareSelection(a.ydoc, {
      anchor: { blockId: id, offset: 2 },
      head: { blockId: id, offset: 4 },
    })!;

    // Bob types in front of the selection: it moves right by two on both sides.
    b.editor.dispatch({
      type: 'insertText',
      payload: { text: 'XX', selection: { anchor: { blockId: id, offset: 0 } } },
    });
    syncAll([a, b]);

    for (const peer of [a, b]) {
      expect(resolveSelection(peer.ydoc, shared)).toEqual({
        anchor: { blockId: id, offset: 4 },
        head: { blockId: id, offset: 6 },
      });
    }

    // Text inserted after the selection does not move it.
    a.editor.dispatch({
      type: 'insertText',
      payload: { text: '!', selection: { anchor: { blockId: id, offset: 8 } } },
    });
    expect(resolveSelection(a.ydoc, shared)?.head.offset).toBe(6);
  });

  it('survives a JSON round trip, like the awareness frame', () => {
    const { a, id } = typed('hello');
    const shared = shareSelection(a.ydoc, {
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    });

    expect(resolveSelection(a.ydoc, JSON.parse(JSON.stringify(shared)))).toEqual({
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    });
  });

  it('clamps an offset beyond the end and refuses a block that does not exist', () => {
    const { a, id } = typed('hi');

    expect(
      resolveSelection(
        a.ydoc,
        shareSelection(a.ydoc, {
          anchor: { blockId: id, offset: 99 },
          head: { blockId: id, offset: 99 },
        }),
      )?.head.offset,
    ).toBe(2);
    expect(
      shareSelection(a.ydoc, {
        anchor: { blockId: 'nope', offset: 0 },
        head: { blockId: 'nope', offset: 0 },
      }),
    ).toBeUndefined();
  });

  it('are not resolved after their block was deleted', () => {
    const { a, b, id } = typed('gone soon');
    const shared = shareSelection(a.ydoc, {
      anchor: { blockId: id, offset: 2 },
      head: { blockId: id, offset: 4 },
    });

    a.ydoc.transact(() => (a.ydoc.getMap('blocks') as Y.Map<unknown>).delete(id));
    syncAll([a, b]);

    expect(resolveSelection(b.ydoc, shared)).toBeUndefined();
  });

  it('treat anything a peer sends as untrusted', () => {
    const { a, id } = typed('x');
    const point = (value: unknown) => ({ block: id, rel: value });

    for (const garbage of [
      undefined,
      null,
      'text',
      42,
      {},
      { anchor: 1, head: 2 },
      { anchor: point(null), head: point(null) },
      { anchor: point('x'), head: point('y') },
      { anchor: point({ type: 'nope' }), head: point({ item: 7 }) },
      { anchor: { block: 5, rel: {} }, head: { block: id, rel: {} } },
    ]) {
      expect(() => resolveSelection(a.ydoc, garbage)).not.toThrow();
      expect(resolveSelection(a.ydoc, garbage)).toBeUndefined();
    }
  });
});

describe('cursorsOf', () => {
  it('lists the people who have a selection, with validated name and color', () => {
    const { a, id } = typed('hello world');
    const selection = shareSelection(a.ydoc, {
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 5 },
    });
    const user = (n: number) => ({ id: n, username: `user-${n}` });
    const cursors = cursorsOf(a.ydoc, [
      { conn: 1, user: user(1), state: { name: 'Анна', color: '#2f6fed', selection } },
      {
        conn: 2,
        user: user(2),
        state: { name: 'x'.repeat(41), color: 'red; background:url(x)', selection },
      },
      { conn: 3, user: user(3), state: { name: 'Нет выделения' } },
      { conn: 4, user: user(4), state: null },
      { conn: 5, user: user(5), state: { selection: 'garbage' } },
    ]);

    expect(cursors.map((cursor) => cursor.id)).toEqual([1, 2]);
    expect(cursors[0]).toMatchObject({
      name: 'Анна',
      color: '#2f6fed',
      head: { offset: 5 },
      anchor: { offset: 0 },
    });
    expect(cursors[1].name).toBe('user-2');
    expect(cursors[1].color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
