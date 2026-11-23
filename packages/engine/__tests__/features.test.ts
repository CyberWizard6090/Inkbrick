import { describe, expect, it } from 'vitest';

import { createSchemaRegistry, ColumnSchema, ColumnsSchema } from '@inkbrick/document';

import {
  Editor,
  columnsBlocks,
  columnsFeature,
  defineFeature,
  tableFeature,
  tocFeature,
} from '@inkbrick/engine';

const firstBlock = (editor: Editor) => {
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];

  return editor.document.getBlock(note)!.children[0];
};

describe('editor features', () => {
  it('the base editor knows nothing about tables or columns', () => {
    const editor = new Editor();

    expect(editor.schema.hasBlock('block:table')).toBe(false);
    expect(editor.schema.hasBlock('block:columns')).toBe(false);
    expect(editor.dispatcher.has('moveBlockToSide')).toBe(false);
    expect(editor.dispatcher.has('insertTableRow')).toBe(false);
  });

  it('features add their blocks and commands', () => {
    const editor = new Editor({ features: [tableFeature, columnsFeature, tocFeature] });

    expect(editor.schema.hasBlock('block:table')).toBe(true);
    expect(editor.schema.hasBlock('block:table-cell')).toBe(true);
    expect(editor.schema.hasBlock('block:columns')).toBe(true);
    expect(editor.schema.hasBlock('block:toc')).toBe(true);
    expect(editor.dispatcher.has('insertTableRow')).toBe(true);
    expect(editor.dispatcher.has('moveBlockToSide')).toBe(true);
  });

  it('a block brings the feature it needs: columnsBlocks in `blocks` enable moving a block to the side', () => {
    const editor = new Editor({ blocks: columnsBlocks });

    expect(editor.dispatcher.has('moveBlockToSide')).toBe(true);
  });

  it('the same feature from `features` and from a block is installed once', () => {
    let setups = 0;
    const feature = defineFeature({ name: 'counted', setup: () => void setups++ });
    const editor = new Editor({
      features: [feature, feature],
      blocks: [{ schema: ColumnsSchema, feature }, { schema: ColumnSchema }],
    });

    expect(setups).toBe(1);
    expect(editor.schema.hasBlock('block:columns')).toBe(true);
  });

  it('a feature adds guards, work after commands and setup', () => {
    const log: string[] = [];
    const feature = defineFeature({
      name: 'audit',
      guards: [({ type }) => type !== 'deleteText'],
      afterCommand: [
        (_engine, transaction) => void log.push(`after ${transaction.getChangedBlocks().length}`),
      ],
      setup: (editor) => void log.push(`setup ${editor.schema.hasBlock('block:paragraph')}`),
    });
    const editor = new Editor({ features: [feature] });
    const id = firstBlock(editor);

    editor.dispatch({ type: 'replaceText', payload: { blockId: id, from: 0, to: 0, text: 'ab' } });

    expect(editor.dispatch({ type: 'deleteText', payload: { blockId: id, from: 0, to: 1 } })).toBe(
      undefined,
    );
    expect(log).toEqual(['setup true', 'after 1']);
  });

  it('with an own schema registry a feature adds behaviour only for blocks the registry knows', () => {
    const schema = createSchemaRegistry([ColumnsSchema, ColumnSchema]);
    const editor = new Editor({ schema, features: [columnsFeature, tableFeature] });

    expect(editor.dispatcher.has('moveBlockToSide')).toBe(true);
    expect(editor.schema.hasBlock('block:table')).toBe(false);
    expect(editor.dispatcher.has('insertTableRow')).toBe(false);
  });

  it('with an own registry and controllers, the controller from `controllers` wins over the feature block one', () => {
    const schema = createSchemaRegistry([ColumnsSchema, ColumnSchema]);
    const own = { menuItems: [] };
    const editor = new Editor({
      schema,
      controllers: { 'block:columns': own },
      features: [columnsFeature],
    });

    expect(editor.controllers.get('block:columns')).toBe(own);
    expect(editor.dispatcher.has('moveBlockToSide')).toBe(true);
  });
});
