import { describe, expect, it } from 'vitest';

import { deserializeDocument, serializeDocument } from '@inkbrick/document';

import {
  Editor,
  PatchError,
  applyPatch,
  columnsFeature,
  onPatch,
  tableFeature,
  toggleFeature,
  type LocalPatch,
} from '../src/internal';

const features = [tableFeature, columnsFeature, toggleFeature];

/** Два редактора с одним документом: правки первого доходят до второго патчами. */
function pair() {
  const a = new Editor({ features });
  const b = new Editor({
    features,
    schema: a.schema,
    document: deserializeDocument(serializeDocument(a.document, a.schema), { schema: a.schema }),
  });
  const sent: LocalPatch[] = [];

  onPatch(a, (patch) => {
    sent.push(patch);
    applyPatch(b, JSON.parse(JSON.stringify(patch)));
  });

  const note = a.document.getBlock(a.document.rootId)!.children[0];
  const first = a.document.getBlock(note)!.children[0];

  return { a, b, sent, note, first };
}

const same = (a: Editor, b: Editor) => expect(b.document.dump()).toEqual(a.document.dump());

describe('patches between editors', () => {
  it('typing, structure, tables, undo and redo reach the other editor', () => {
    const { a, b, sent, first } = pair();

    a.dispatch({ type: 'replaceText', payload: { blockId: first, from: 0, to: 0, text: 'hello' } });
    a.dispatch({ type: 'splitBlock', payload: { blockId: first, offset: 2 } });
    a.dispatch({ type: 'insertBlock', payload: { flavour: 'block:table', afterId: first } });
    a.dispatch({ type: 'convertBlock', payload: { blockId: first, flavour: 'block:heading' } });
    same(a, b);

    a.undo();
    a.undo();
    same(a, b);
    a.redo();
    same(a, b);

    expect(sent.map((patch) => patch.source)).toContain('undo');
    expect(sent.map((patch) => patch.source)).toContain('redo');
  });

  it('a remote patch does not come back as a local one and is not in the local history', () => {
    const { a, b, first } = pair();
    const echoed: LocalPatch[] = [];

    onPatch(b, (patch) => echoed.push(patch));
    a.dispatch({ type: 'replaceText', payload: { blockId: first, from: 0, to: 0, text: 'x' } });

    expect(echoed).toEqual([]);
    expect(b.canUndo).toBe(false);
    expect(b.document.getBlock(first)!.content).toEqual([{ insert: 'x' }]);
  });

  it('a remote patch over a block from the local history clears that history', () => {
    const { a, b, first } = pair();

    b.dispatch({ type: 'replaceText', payload: { blockId: first, from: 0, to: 0, text: 'mine ' } });
    expect(b.canUndo).toBe(true);

    a.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'theirs' },
    });

    // Отмена вернула бы блок целиком и затёрла чужую правку: истории больше нет.
    expect(b.canUndo).toBe(false);
  });

  it('concurrent edits the author did not see survive: new siblings stay, gone children drop out, deletion takes the subtree', () => {
    const a = new Editor({ features });
    const b = new Editor({
      features,
      schema: a.schema,
      document: deserializeDocument(serializeDocument(a.document, a.schema), { schema: a.schema }),
    });
    const note = a.document.getBlock(a.document.rootId)!.children[0];
    const first = a.document.getBlock(note)!.children[0];
    const patches = (editor: Editor) => {
      const sent: LocalPatch[] = [];

      onPatch(editor, (patch) => sent.push(patch));

      return sent;
    };
    const fromA = patches(a);
    const fromB = patches(b);

    // Оба добавляют абзац после первого: каждый патч переписывает список детей заметки.
    const ownA = a.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: first },
    })!.blockId;
    const ownB = b.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: first },
    })!.blockId;

    applyPatch(b, fromA[0]);
    expect(b.document.getBlock(note)!.children).toEqual([first, ownB, ownA]);

    // Патч ссылается на ребёнка, которого здесь уже нет: он выпадает, остальное применяется.
    const result = applyPatch(b, {
      blocks: { [note]: { ...b.document.getBlock(note)!, children: [first, ownA, ownB, 'ghost'] } },
    });

    expect(result.blocks[note]!.children).toEqual([first, ownA, ownB]);

    // Удаление переключателя уносит и блок, который в нём успели добавить, не зная об удалении.
    const toggle = a.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:toggle', afterId: ownA },
    })!.blockId;

    applyPatch(b, fromA.at(-1)!);
    const inner = b.document.getBlock(toggle)!.children[0];

    b.dispatch({ type: 'insertBlock', payload: { flavour: 'block:paragraph', afterId: inner } });
    a.dispatch({ type: 'delete-blocks', payload: { ids: [toggle] } });
    applyPatch(b, fromA.at(-1)!);

    expect(b.document.getBlock(toggle)).toBeUndefined();
    expect(
      Object.values(b.document.dump()).every(
        (block) => block.parentId === null || b.document.getBlock(block.parentId),
      ),
    ).toBe(true);
    expect(fromB.length).toBeGreaterThan(0);
  });

  it('a broken patch is refused whole and the document stays as it was', () => {
    const { b, note, first } = pair();
    const before = structuredClone(b.document.dump());
    const block = b.document.getBlock(first)!;

    const attempts = [
      { blocks: { [first]: { ...block, id: 'other' } } },
      { blocks: { [first]: { ...block, parentId: 'missing' } } },
      { blocks: { [b.document.rootId]: null } },
      { blocks: { [first]: null } }, // ещё числится в заметке
      {
        blocks: {
          x: {
            id: 'x',
            flavour: 'block:heading',
            parentId: note,
            children: [],
            content: [],
            props: { level: 9 },
          },
        },
      },
    ];

    for (const patch of attempts) {
      expect(() => applyPatch(b, patch as never), JSON.stringify(patch)).toThrow(PatchError);
      expect(b.document.dump()).toEqual(before);
    }
  });

  it('applying the same patch twice is the same as once', () => {
    const { a, b, sent, first } = pair();

    a.dispatch({ type: 'replaceText', payload: { blockId: first, from: 0, to: 0, text: 'twice' } });
    applyPatch(b, sent.at(-1)!);
    same(a, b);
  });

  it('a remote patch is normalized: an emptied note gets its paragraph back', () => {
    const { b, note, first } = pair();
    const noteBlock = b.document.getBlock(note)!;

    applyPatch(b, { blocks: { [first]: null, [note]: { ...noteBlock, children: [] } } });

    expect(b.document.getBlock(note)!.children).toHaveLength(1);
  });
});
