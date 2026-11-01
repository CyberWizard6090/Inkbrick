import { describe, expect, it } from 'vitest';

import { MAX_NESTING_DEPTH } from '@inkbrick/document';

import { Editor } from '../src';

function setup(options: ConstructorParameters<typeof Editor>[0] = {}) {
  const editor = new Editor(options);
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  return { editor, noteId, firstId };
}

describe('block meta', () => {
  it('is off by default', () => {
    const { editor, firstId } = setup();

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 0, to: 0, text: 'a' },
    });

    expect(editor.document.getBlock(firstId)!.meta).toBeUndefined();
  });

  it('stamps created and updated time and author on changed blocks', () => {
    let time = 1000;
    let user = 'alice';
    const { editor, firstId } = setup({ meta: { now: () => time, user: () => user } });

    const insert = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: firstId },
    }) as { blockId: string };

    expect(editor.document.getBlock(insert.blockId)!.meta).toEqual({
      createdAt: 1000,
      createdBy: 'alice',
      updatedAt: 1000,
      updatedBy: 'alice',
    });

    time = 2000;
    user = 'bob';
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: insert.blockId, from: 0, to: 0, text: 'x' },
    });

    expect(editor.document.getBlock(insert.blockId)!.meta).toEqual({
      createdAt: 1000,
      createdBy: 'alice',
      updatedAt: 2000,
      updatedBy: 'bob',
    });
  });

  it('works without an author (meta: true)', () => {
    const { editor, firstId } = setup({ meta: true });

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 0, to: 0, text: 'a' },
    });

    const meta = editor.document.getBlock(firstId)!.meta!;

    expect(typeof meta.createdAt).toBe('number');
    expect(meta.updatedAt).toBeGreaterThanOrEqual(meta.createdAt);
    expect('createdBy' in meta).toBe(false);
    expect('updatedBy' in meta).toBe(false);
  });

  it('undo restores previous meta, redo stamps again', () => {
    let time = 10;
    const { editor, firstId } = setup({ meta: { now: () => time, user: () => 'u' } });

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 0, to: 0, text: 'a' },
    });
    editor.sealHistory();

    time = 20;
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 1, to: 1, text: 'b' },
    });

    expect(editor.document.getBlock(firstId)!.meta!.updatedAt).toBe(20);

    editor.undo();
    expect(editor.document.getBlock(firstId)!.meta!.updatedAt).toBe(10);

    time = 30;
    editor.redo();
    expect(editor.document.getBlock(firstId)!.meta!.updatedAt).toBe(30);
    expect(editor.document.getBlock(firstId)!.meta!.createdAt).toBe(10);
  });
});

describe('BlockEngine.move relation check', () => {
  it('refuses to move a block into a parent that does not accept it', () => {
    const { editor, noteId, firstId } = setup();

    const heading = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:heading', afterId: firstId },
    }) as { blockId: string };

    expect(() =>
      editor.store.transact((tx) => editor.engine.block.move(tx, heading.blockId, firstId, 0)),
    ).toThrow('cannot be placed inside');

    expect(editor.document.getBlock(heading.blockId)!.parentId).toBe(noteId);
  });
});

describe('block meta on structural changes', () => {
  it('moving a block stamps it and both parents; undo restores their meta', () => {
    let time = 100;
    const { editor, noteId, firstId } = setup({ meta: { now: () => time, user: () => 'u' } });

    const list = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:list', afterId: firstId, props: { type: 'bullet' } },
    }) as { blockId: string };
    const item = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:list', afterId: list.blockId, props: { type: 'bullet' } },
    }) as { blockId: string };

    editor.sealHistory();

    const meta = (id: string) => editor.document.getBlock(id)!.meta!;
    const before = { item: meta(item.blockId), list: meta(list.blockId), note: meta(noteId) };

    time = 200;
    editor.dispatch({ type: 'indentBlock', payload: { blockId: item.blockId } });

    expect(editor.document.getBlock(item.blockId)!.parentId).toBe(list.blockId);
    expect(meta(item.blockId).updatedAt).toBe(200);
    expect(meta(list.blockId).updatedAt).toBe(200);
    expect(meta(noteId).updatedAt).toBe(200);
    expect(meta(item.blockId).createdAt).toBe(before.item.createdAt);

    editor.undo();

    expect(meta(item.blockId)).toEqual(before.item);
    expect(meta(list.blockId)).toEqual(before.list);
    expect(meta(noteId)).toEqual(before.note);
  });

  it('without the meta option structural changes add no meta', () => {
    const { editor, noteId, firstId } = setup();

    editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: firstId },
    });

    expect(editor.document.getBlock(noteId)!.meta).toBeUndefined();
  });
});

describe('mass operations', () => {
  it('moving 1 000 blocks (reversing them) is one undo step and undo/redo restore the exact order', () => {
    const { editor, noteId, firstId } = setup();
    let after = firstId;

    editor.batch(() => {
      for (let i = 0; i < 1000; i++) {
        after = (
          editor.dispatch({
            type: 'insertBlock',
            payload: { flavour: 'block:paragraph', afterId: after },
          }) as { blockId: string }
        ).blockId;
      }
    });
    editor.sealHistory();

    const order = () => editor.document.getBlock(noteId)!.children;
    const original = [...order()];
    const started = performance.now();

    editor.batch(() => {
      let target = firstId;

      // каждый следующий блок встаёт перед предыдущим перенесённым: итог — обратный порядок
      for (const id of original.slice(1)) {
        editor.dispatch({
          type: 'moveBlock',
          payload: { blockId: id, targetId: target, position: 'before' },
        });
        target = id;
      }
    });

    const elapsed = performance.now() - started;
    const reversed = [...original.slice(1).reverse(), firstId];

    expect(order()).toEqual(reversed);

    editor.undo();
    expect(order()).toEqual(original);

    editor.redo();
    expect(order()).toEqual(reversed);

    // ориентир, а не бенчмарк: на порядки выше реального времени, ловит только квадратичный взрыв
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('nesting depth limit', () => {
  it('Tab and moving are refused when the result would be deeper than MAX_NESTING_DEPTH', () => {
    const { editor, noteId, firstId } = setup();
    const list = (payload: Record<string, unknown>) =>
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:list', props: { type: 'bullet' }, ...payload },
        }) as { blockId: string }
      ).blockId;

    let deepest = list({ afterId: firstId });

    for (let depth = 3; depth <= MAX_NESTING_DEPTH; depth++) deepest = list({ parentId: deepest });

    const depthOf = (id: string) => {
      let count = 0;

      for (
        let b = editor.document.getBlock(id);
        b?.parentId;
        b = editor.document.getBlock(b.parentId)
      )
        count++;

      return count;
    };

    expect(depthOf(deepest)).toBe(MAX_NESTING_DEPTH);

    const sibling = list({ afterId: deepest });

    expect(depthOf(sibling)).toBe(MAX_NESTING_DEPTH);
    expect(editor.can('indentBlock', { blockId: sibling })).toBe(false);

    const parent = list({ afterId: firstId });

    list({ parentId: parent });

    expect(editor.can('moveBlock', { blockId: parent, targetId: deepest, position: 'after' })).toBe(
      false,
    );
    expect(editor.document.getBlock(noteId)!.children).toContain(parent);
    expect(editor.can('moveBlock', { blockId: parent, targetId: firstId, position: 'after' })).toBe(
      true,
    );
  });
});

describe('toggle-heading', () => {
  it('turns a paragraph into a heading of the given level and back', () => {
    const { editor, firstId } = setup();
    const block = () => editor.document.getBlock(firstId)!;

    editor.execute('toggle-heading', { id: firstId, level: 2 });
    expect(block().flavour).toBe('block:heading');
    expect(block().props).toMatchObject({ level: 2 });

    editor.execute('toggle-heading', { id: firstId });
    expect(block().flavour).toBe('block:paragraph');

    editor.execute('toggle-heading', { id: firstId });
    expect(block().props).toMatchObject({ level: 1 });

    expect(editor.can('toggle-heading', { id: editor.document.rootId })).toBe(false);
    expect(editor.can('toggle-heading', { id: 'missing' })).toBe(false);
  });
});
