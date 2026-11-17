import { describe, expect, it } from 'vitest';

import { validateSnapshot } from '@inkbrick/document';

import { REMOTE_ORIGIN } from '../src';
import { createPeer, createServerState, firstParagraph, schema, text, type Peer } from './harness';
import * as Y from 'yjs';

const LIMIT = 512 * 1024;

/** Участники, обмен обновлениями: всё, что `from` отправил бы на сервер, записывается и сразу применяется у `to`. */
function link(from: Peer): { sizes: number[]; updates: Uint8Array[] } {
  const sent = { sizes: [] as number[], updates: [] as Uint8Array[] };

  from.collab.onLocalUpdate((update) => {
    sent.sizes.push(update.length);
    sent.updates.push(update);
  });

  return sent;
}

function deliver(updates: readonly Uint8Array[], to: Peer): void {
  for (const update of updates) to.collab.receive(update);
}

const fragmentOf = (lines: readonly string[]) => ({
  blocks: lines.map((line) => ({
    flavour: 'block:paragraph',
    props: {},
    content: [{ insert: line }],
    children: [],
  })),
});

describe('a big paste goes out in pieces', () => {
  it('one block with 1.5 million characters of Cyrillic and emoji', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const sent = link(a);
    const id = firstParagraph(a);
    const body = 'Съешь ещё этих мягких булок 🙂 '.repeat(50_000);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: body, selection: { anchor: { blockId: id, offset: 0 } } },
    });

    expect(body.length).toBeGreaterThan(1_500_000);
    expect(sent.sizes.length).toBeGreaterThan(5);
    expect(Math.max(...sent.sizes)).toBeLessThan(LIMIT);

    deliver(sent.updates, b);

    expect(text(b, id)).toBe(body);
    expect(text(a, id)).toBe(body);
    expect(a.collab.inSync() && b.collab.inSync()).toBe(true);
  });

  it('is undone as one step', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const sent = link(a);
    const id = firstParagraph(a);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'ж'.repeat(400_000), selection: { anchor: { blockId: id, offset: 0 } } },
    });
    expect(sent.sizes.length).toBeGreaterThan(1);

    a.collab.history.undo();
    deliver(sent.updates, b);

    expect(text(a, id)).toBe('');
    expect(text(b, id)).toBe('');
  });

  it('pasting into the middle of a big existing block sends only the edit', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'я'.repeat(300_000), selection: { anchor: { blockId: id, offset: 0 } } },
    });
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc), REMOTE_ORIGIN);

    const sent = link(a);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'x', selection: { anchor: { blockId: id, offset: 150_000 } } },
    });

    expect(sent.sizes).toHaveLength(1);
    expect(sent.sizes[0]).toBeLessThan(1000);
  });

  it('four thousand paragraphs, hidden until their places arrive', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const sent = link(a);
    const id = firstParagraph(a);
    const lines = Array.from({ length: 4000 }, (_, index) => `строка ${index} ${'z'.repeat(40)}`);

    a.editor.dispatch({
      type: 'pasteFragment',
      payload: { at: { blockId: id, offset: 0 }, fragment: fragmentOf(lines) },
    } as never);

    expect(sent.sizes.length).toBeGreaterThan(3);
    expect(Math.max(...sent.sizes)).toBeLessThan(LIMIT);

    // The blocks are written without a place first: a peer that has only the first updates (the data) shows none of
    // them. They take their places in the last updates.
    const countBlocks = (peer: Peer): number => Object.keys(peer.collab.snapshot().blocks).length;
    const before = countBlocks(b);

    deliver(sent.updates.slice(0, 10), b);
    expect(countBlocks(b)).toBe(before);

    deliver(sent.updates.slice(10), b);

    expect(countBlocks(b)).toBeGreaterThanOrEqual(before + 3999);
    expect(b.collab.inSync()).toBe(true);
    expect(validateSnapshot(b.editor.serialize(), schema)).toEqual([]);
    expect(JSON.stringify(b.editor.serialize().blocks)).toBe(
      JSON.stringify(a.editor.serialize().blocks),
    );
  });
});
