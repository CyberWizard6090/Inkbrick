import { describe, expect, it } from 'vitest';

import type { BlockId } from '@inkbrick/document';

import { Editor, type CaretResult } from '../src';

function setup() {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  const text = (id: BlockId) =>
    editor.engine.inline.toPlainText(editor.document.getBlock(id)?.content ?? []);
  const type = (blockId: BlockId, offset: number, value: string) =>
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId, from: offset, to: offset, text: value },
    });
  const convert = (
    blockId: BlockId,
    flavour: string,
    props?: Record<string, unknown>,
    offset?: number,
  ) =>
    editor.dispatch({ type: 'convertBlock', payload: { blockId, flavour, props, offset } }) as
      CaretResult | undefined;
  const children = () => editor.document.getBlock(noteId)!.children;
  const flavours = () => children().map((id) => editor.document.getBlock(id)!.flavour);

  return { editor, noteId, firstId, text, type, convert, children, flavours };
}

describe('built-in block schemas', () => {
  it('registers quote, code and divider with sensible defaults', () => {
    const { editor } = setup();

    expect(editor.schema.createProps('block:code')).toEqual({ language: 'plain' });
    expect(editor.schema.createProps('block:quote')).toEqual({});
    expect(editor.schema.validateRelation('block:note', 'block:divider')).toBe(true);
    expect(editor.schema.validateRelation('block:list', 'block:code')).toBe(false);
    expect(editor.schema.getBlockSchema('block:divider')!.inline).toBe(false);
  });
});

describe('convertBlock', () => {
  it('turns a paragraph into a heading/quote/code and keeps the text', () => {
    const { editor, firstId, text, type, convert } = setup();
    type(firstId, 0, 'hello');

    expect(convert(firstId, 'block:heading', { level: 2 })).toEqual({
      blockId: firstId,
      offset: 5,
    });
    expect(editor.document.getBlock(firstId)!.props).toEqual({ level: 2, align: 'left' });

    convert(firstId, 'block:quote');
    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:quote');

    convert(firstId, 'block:code', { language: 'ts' });
    expect(editor.document.getBlock(firstId)!.props).toEqual({ language: 'ts' });
    expect(text(firstId)).toBe('hello');
  });

  it('places the caret at the requested offset (clamped to the text)', () => {
    const { firstId, type, convert } = setup();
    type(firstId, 0, 'abc');

    expect(convert(firstId, 'block:quote', undefined, 1)!.offset).toBe(1);
    expect(convert(firstId, 'block:quote', undefined, 99)!.offset).toBe(3);
  });

  it('replaces an empty block with a divider and adds a paragraph after it', () => {
    const { firstId, convert, children, flavours } = setup();

    const caret = convert(firstId, 'block:divider')!;

    expect(flavours()).toEqual(['block:divider', 'block:paragraph']);
    expect(children()[0]).toBe(firstId);
    expect(caret).toEqual({ blockId: children()[1], offset: 0 });
  });

  it('keeps a non-empty block and inserts the divider after it', () => {
    const { firstId, type, convert, flavours, children, text } = setup();
    type(firstId, 0, 'keep me');

    const caret = convert(firstId, 'block:divider')!;

    expect(flavours()).toEqual(['block:paragraph', 'block:divider', 'block:paragraph']);
    expect(text(firstId)).toBe('keep me');
    expect(caret.blockId).toBe(children()[2]);
  });

  it('lifts children that do not fit the new type', () => {
    const { editor, firstId, type, convert, children } = setup();

    convert(firstId, 'block:list', { type: 'bullet' });
    type(firstId, 0, 'a');
    const second = (
      editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: firstId, offset: 1 },
      }) as CaretResult
    ).blockId;
    type(second, 0, 'b');
    editor.dispatch({ type: 'indentBlock', payload: { blockId: second } });

    convert(firstId, 'block:heading', { level: 1 });

    expect(editor.document.getBlock(firstId)!.children).toEqual([]);
    expect(children()).toEqual([firstId, second]);
    expect(editor.document.getBlock(second)!.parentId).toBe(
      editor.document.getBlock(firstId)!.parentId,
    );
  });

  it('refuses unknown flavours and invalid placements', () => {
    const { editor, noteId, firstId, convert } = setup();
    const before = structuredClone(editor.document.dump());

    expect(convert(firstId, 'block:nope')).toBeUndefined();
    expect(convert(firstId, 'block:note')).toBeUndefined();
    expect(convert(noteId, 'block:paragraph')).toBeUndefined();
    expect(editor.document.dump()).toEqual(before);
  });

  it('is a single undo step', () => {
    const { editor, firstId, convert, flavours } = setup();

    convert(firstId, 'block:divider');
    expect(flavours().length).toBe(2);

    editor.undo();

    expect(flavours()).toEqual(['block:paragraph']);
  });

  it('slash flow: removing "/query" and converting in one batch is one undo step', () => {
    const { editor, firstId, type, convert, text } = setup();
    type(firstId, 0, '/head');
    editor.sealHistory();

    editor.batch(() => {
      editor.dispatch({ type: 'deleteText', payload: { blockId: firstId, from: 0, to: 5 } });
      convert(firstId, 'block:heading', { level: 1 }, 0);
    });

    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:heading');
    expect(text(firstId)).toBe('');

    editor.undo();

    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:paragraph');
    expect(text(firstId)).toBe('/head');
  });
});

describe('Enter behaviors from the schema', () => {
  it('code: Enter inserts a newline, a second Enter at the end exits into a paragraph', () => {
    const { editor, firstId, type, convert, text, flavours } = setup();
    convert(firstId, 'block:code');
    type(firstId, 0, 'a');

    const first = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 1 },
    }) as CaretResult;
    expect(first).toEqual({ blockId: firstId, offset: 2 });
    expect(text(firstId)).toBe('a\n');
    expect(flavours()).toEqual(['block:code']);

    const second = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 2 },
    }) as CaretResult;
    expect(text(firstId)).toBe('a');
    expect(flavours()).toEqual(['block:code', 'block:paragraph']);
    expect(second.offset).toBe(0);
  });

  it('code: Enter in the middle inserts a newline at the caret', () => {
    const { editor, firstId, type, convert, text } = setup();
    convert(firstId, 'block:code');
    type(firstId, 0, 'ab');

    editor.dispatch({ type: 'splitBlock', payload: { blockId: firstId, offset: 1 } });

    expect(text(firstId)).toBe('a\nb');
  });

  it('quote and list exit on Enter in an empty block, but split otherwise', () => {
    const { editor, firstId, type, convert, flavours } = setup();
    convert(firstId, 'block:quote');
    type(firstId, 0, 'q');

    const next = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 1 },
    }) as CaretResult;
    expect(flavours()).toEqual(['block:quote', 'block:quote']);

    editor.dispatch({ type: 'splitBlock', payload: { blockId: next.blockId, offset: 0 } });
    expect(flavours()).toEqual(['block:quote', 'block:paragraph']);
  });

  it('heading continues with a paragraph', () => {
    const { editor, firstId, convert, flavours } = setup();
    convert(firstId, 'block:heading', { level: 1 });

    editor.dispatch({ type: 'splitBlock', payload: { blockId: firstId, offset: 0 } });

    expect(flavours()).toEqual(['block:heading', 'block:paragraph']);
  });
});

describe('dividers', () => {
  it('Backspace at the start of the block after a divider removes the divider', () => {
    const { editor, firstId, type, convert, children, text } = setup();
    type(firstId, 0, 'top');
    const after = convert(firstId, 'block:divider')!.blockId;
    type(after, 0, 'bottom');
    editor.sealHistory();

    const caret = editor.dispatch({
      type: 'deleteBackward',
      payload: { blockId: after, offset: 0 },
    }) as CaretResult;

    expect(children()).toEqual([firstId, after]);
    expect(text(after)).toBe('bottom');
    expect(caret).toEqual({ blockId: after, offset: 0 });

    editor.undo();
    expect(children().length).toBe(3);
  });

  it('a range delete across a divider removes it', () => {
    const { editor, firstId, type, convert, children, text } = setup();
    type(firstId, 0, 'top');
    const after = convert(firstId, 'block:divider')!.blockId;
    type(after, 0, 'bottom');

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: firstId, offset: 1 }, to: { blockId: after, offset: 3 } },
    });

    expect(children()).toEqual([firstId]);
    expect(text(firstId)).toBe('ttom');
  });

  it('typing commands never touch a divider', () => {
    const { editor, firstId, convert, children } = setup();
    convert(firstId, 'block:divider');
    const divider = children()[0];

    expect(
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: divider, from: 0, to: 0, text: 'x' },
      }),
    ).toBeUndefined();
    expect(
      editor.dispatch({ type: 'splitBlock', payload: { blockId: divider, offset: 0 } }),
    ).toBeUndefined();
    expect(editor.document.getBlock(divider)!.flavour).toBe('block:divider');
    expect(editor.document.getBlock(divider)!.content).toEqual([]);
  });
});

describe('nesting and Tab', () => {
  function nested() {
    const s = setup();
    const { editor, firstId, convert, type } = s;

    convert(firstId, 'block:list', { type: 'bullet' });
    type(firstId, 0, 'a');
    const b = (
      editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: firstId, offset: 1 },
      }) as CaretResult
    ).blockId;
    type(b, 0, 'b');
    editor.dispatch({ type: 'indentBlock', payload: { blockId: b } });

    return { ...s, a: firstId, b };
  }

  const tree = (s: ReturnType<typeof nested>, id: BlockId = s.noteId): string[] => {
    const block = s.editor.document.getBlock(id)!;

    return block.children.flatMap((childId) => {
      const child = s.editor.document.getBlock(childId)!;
      const label = `${child.flavour.replace('block:', '')}:${s.text(childId)}`;

      return [label, ...tree(s, childId).map((line) => `  ${line}`)];
    });
  };

  it('only indentable blocks (list items) can be indented — a paragraph never falls into a list', () => {
    const { editor, firstId, convert, type, children } = setup();

    convert(firstId, 'block:list', { type: 'bullet' });
    type(firstId, 0, 'a');
    editor.dispatch({ type: 'splitBlock', payload: { blockId: firstId, offset: 1 } });
    const para = children()[1];
    convert(para, 'block:paragraph'); // Enter в пустом пункте → параграф
    type(para, 0, 'text');

    expect(editor.dispatch({ type: 'indentBlock', payload: { blockId: para } })).toBeUndefined();
    expect(children()).toEqual([firstId, para]);
    expect(editor.document.getBlock(para)!.parentId).toBe(
      editor.document.getBlock(firstId)!.parentId,
    );
  });

  it('Enter in an empty nested item lifts it one level instead of leaving a paragraph inside the list', () => {
    const s = nested();
    const { editor, b } = s;

    editor.dispatch({ type: 'deleteText', payload: { blockId: b, from: 0, to: 1 } });
    editor.dispatch({ type: 'splitBlock', payload: { blockId: b, offset: 0 } });

    expect(tree(s)).toEqual(['list:a', 'list:']);

    editor.dispatch({ type: 'splitBlock', payload: { blockId: b, offset: 0 } });
    expect(tree(s)).toEqual(['list:a', 'paragraph:']);
  });

  it('repeated Enter on an empty line never piles up paragraphs inside a list', () => {
    const s = nested();
    const { editor, b } = s;

    editor.dispatch({ type: 'deleteText', payload: { blockId: b, from: 0, to: 1 } });
    for (let i = 0; i < 4; i++) {
      const caret = editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: b, offset: 0 },
      }) as CaretResult;
      expect(editor.document.getBlock(caret.blockId)!.parentId).toBe(s.noteId);
    }

    expect(editor.document.getBlock(s.a)!.children).toEqual([]);
    expect(tree(s).every((line) => !line.startsWith(' '))).toBe(true);
  });

  it('Backspace at the start of a nested item lifts it, then turns it into a paragraph', () => {
    const s = nested();
    const { editor, b } = s;

    editor.dispatch({ type: 'deleteBackward', payload: { blockId: b, offset: 0 } });
    expect(tree(s)).toEqual(['list:a', 'list:b']);

    editor.dispatch({ type: 'deleteBackward', payload: { blockId: b, offset: 0 } });
    expect(tree(s)).toEqual(['list:a', 'paragraph:b']);
  });

  it('outdent keeps the visual order: following siblings become children of the lifted item', () => {
    const s = nested();
    const { editor, a, b, type } = s;

    const c = (
      editor.dispatch({ type: 'splitBlock', payload: { blockId: b, offset: 1 } }) as CaretResult
    ).blockId;
    type(c, 0, 'c');
    const d = (
      editor.dispatch({ type: 'splitBlock', payload: { blockId: c, offset: 1 } }) as CaretResult
    ).blockId;
    type(d, 0, 'd');
    expect(tree(s)).toEqual(['list:a', '  list:b', '  list:c', '  list:d']);

    editor.dispatch({ type: 'outdentBlock', payload: { blockId: c } });

    expect(tree(s)).toEqual(['list:a', '  list:b', 'list:c', '  list:d']);
    expect(editor.document.getBlock(a)!.children).toEqual([b]);
  });

  it('outdent is undone in one step', () => {
    const s = nested();
    const { editor, b } = s;
    const before = structuredClone(editor.document.dump());
    editor.sealHistory();

    editor.dispatch({ type: 'outdentBlock', payload: { blockId: b } });
    editor.undo();

    expect(editor.document.dump()).toEqual(before);
  });

  it('a top-level item cannot be outdented', () => {
    const s = nested();

    expect(s.editor.dispatch({ type: 'outdentBlock', payload: { blockId: s.a } })).toBeUndefined();
  });
});
