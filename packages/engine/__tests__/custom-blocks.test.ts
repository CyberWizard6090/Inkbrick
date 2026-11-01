import { describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  serializeDocument,
  z,
  type BlockSchema,
} from '@inkbrick/document';

import { Editor, type CaretResult } from '../src';

const WidgetSchema: BlockSchema = {
  flavour: 'block:widget',
  name: 'Widget',
  icon: 'info',
  propsSchema: z.object({ tone: z.enum(['info', 'warn']).default('info') }),
  allowedParents: ['block:note'],
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'widget',
};

function setup() {
  const editor = new Editor({ blocks: [WidgetSchema] });
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  return { editor, noteId, firstId };
}

describe('custom block types', () => {
  it('can be created, edited and serialized through the engine', () => {
    const { editor, noteId, firstId } = setup();

    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:widget', afterId: firstId },
    }) as CaretResult;

    const block = editor.document.getBlock(caret.blockId)!;
    expect(block.flavour).toBe('block:widget');
    expect(block.props).toEqual({ tone: 'info' });
    expect(editor.document.getBlock(noteId)!.children).toEqual([firstId, block.id]);

    editor.dispatch({
      type: 'insertText',
      payload: { text: 'hello', selection: { anchor: { blockId: block.id, offset: 0 } } },
    });
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: block.id, props: { tone: 'warn' } },
    });

    const schema = createSchemaRegistry([WidgetSchema]);
    const snapshot = serializeDocument(editor.document);
    const restored = new Editor({ schema, document: deserializeDocument(snapshot, { schema }) });

    expect(serializeDocument(restored.document)).toEqual(snapshot);
    expect(restored.document.getBlock(block.id)!.props).toEqual({ tone: 'warn' });
  });

  it('rejects invalid props atomically', () => {
    const { editor, firstId } = setup();
    const before = structuredClone(editor.document.dump());

    expect(() =>
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:widget', afterId: firstId, props: { tone: 'purple' } },
      }),
    ).toThrow();

    expect(editor.document.dump()).toEqual(before);
  });

  it('refuses a flavour that is not registered in this editor', () => {
    const editor = new Editor();
    const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
    const firstId = editor.document.getBlock(noteId)!.children[0];

    const result = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:widget', afterId: firstId },
    });

    expect(result).toBeUndefined();
    expect(editor.document.getBlock(noteId)!.children).toEqual([firstId]);
  });

  it('does not accept both "schema" and "blocks"', () => {
    expect(() => new Editor({ schema: createSchemaRegistry(), blocks: [WidgetSchema] })).toThrow();
  });
});

describe('unknown blocks', () => {
  function withUnknown() {
    const source = new Editor();
    const snapshot = serializeDocument(source.document);
    const note = snapshot.blocks[snapshot.rootId].children[0];
    const first = snapshot.blocks[note].children[0];

    snapshot.blocks['u1'] = {
      id: 'u1',
      flavour: 'block:mystery',
      parentId: note,
      children: [],
      content: [{ insert: 'data' }],
      props: { a: 1 },
    };
    snapshot.blocks[note].children.push('u1');

    const schema = createSchemaRegistry();
    const editor = new Editor({ schema, document: deserializeDocument(snapshot, { schema }) });

    return { editor, snapshot, first };
  }

  it('survive a load/save cycle unchanged', () => {
    const { editor, snapshot } = withUnknown();

    expect(serializeDocument(editor.document)).toEqual(snapshot);
  });

  it('cannot be edited, merged into or morphed by commands', () => {
    const { editor, snapshot } = withUnknown();

    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: 'u1', offset: 0 } }),
    ).toBeUndefined();
    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: 'u1', offset: 2 } }),
    ).toBeUndefined();
    expect(
      editor.dispatch({
        type: 'morphBlock',
        payload: { blockId: 'u1', flavour: 'block:paragraph' },
      }),
    ).toBeUndefined();

    expect(
      editor.dispatch({
        type: 'insertText',
        payload: { text: 'x', selection: { anchor: { blockId: 'u1', offset: 0 } } },
      }),
    ).toBeUndefined();

    // параграф сразу после неизвестного блока: склейка в него запрещена
    const after = editor.document.getBlock('u1')!.parentId!;
    const created = editor.store.transact((tx) => {
      const block = editor.engine.block.create({ flavour: 'block:paragraph', parentId: after });
      editor.engine.block.insert(tx, after, 2, block);
      return block;
    });
    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: created.id, offset: 0 } }),
    ).toBeUndefined();

    expect(editor.document.getBlock('u1')).toEqual(snapshot.blocks['u1']);
  });

  it('can still be deleted explicitly', () => {
    const { editor } = withUnknown();

    editor.execute('delete-block', { id: 'u1' });

    expect(editor.document.getBlock('u1')).toBeUndefined();
  });
});
