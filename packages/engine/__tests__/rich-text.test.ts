import { describe, expect, it } from 'vitest';

import { FORMULA_CHAR, MAX_FORMULA_LENGTH, type BlockId } from '@inkbrick/document';

import {
  Editor,
  fragmentToHtml,
  fragmentToPlainText,
  sanitizeFragment,
  type CaretResult,
} from '../src';

function setup(texts: string[], flavour = 'block:paragraph') {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(noteId)!.children[0]];

  for (let i = 1; i < texts.length; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour, afterId: ids[i - 1] },
        }) as CaretResult
      ).blockId,
    );
  }
  texts.forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );
  editor.clearHistory();

  return { editor, ids };
}

const p = (blockId: BlockId, offset: number) => ({ blockId, offset });
const content = (editor: Editor, id: BlockId) => editor.document.getBlock(id)!.content;
const text = (editor: Editor, id: BlockId) => editor.engine.inline.toPlainText(content(editor, id));

describe('insertFormula', () => {
  it('replaces the range with one object character carrying the LaTeX', () => {
    const { editor, ids } = setup(['E = x']);

    const caret = editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 4, to: 5, latex: ' mc^2 ' },
    });

    expect(caret).toEqual({ blockId: ids[0], offset: 5 });
    expect(text(editor, ids[0])).toBe(`E = ${FORMULA_CHAR}`);
    expect(content(editor, ids[0])).toEqual([
      { insert: 'E = ' },
      { insert: FORMULA_CHAR, attributes: { formula: 'mc^2' } },
    ]);
  });

  it('is one undo step and restores the caret', () => {
    const { editor, ids } = setup(['abc']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 1, to: 1, latex: 'x' },
    });
    expect(text(editor, ids[0])).toBe(`a${FORMULA_CHAR}bc`);

    expect(editor.undo()?.caret).toEqual({ blockId: ids[0], offset: 1 });
    expect(text(editor, ids[0])).toBe('abc');

    editor.redo();
    expect(text(editor, ids[0])).toBe(`a${FORMULA_CHAR}bc`);
  });

  it('refuses empty, oversized, code-block and text-less targets', () => {
    const { editor, ids } = setup(['abc']);
    const can = (latex: string, blockId = ids[0]) =>
      editor.can('insertFormula', { blockId, from: 0, to: 0, latex });

    expect(can('x')).toBe(true);
    expect(can('   ')).toBe(false);
    expect(can('')).toBe(false);
    expect(can('x'.repeat(MAX_FORMULA_LENGTH + 1))).toBe(false);

    editor.dispatch({ type: 'convertBlock', payload: { blockId: ids[0], flavour: 'block:code' } });
    expect(can('x')).toBe(false);

    const divider = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:divider', afterId: ids[0] },
    }) as CaretResult;

    expect(can('x', divider.blockId)).toBe(false);
  });

  it('text typed right after a formula does not become part of it', () => {
    const { editor, ids } = setup(['']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 0, to: 0, latex: 'x' },
    });
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: ids[0], from: 1, to: 1, text: 'ab' },
    });
    editor.dispatch({
      type: 'insertText',
      payload: { text: 'c', selection: { anchor: p(ids[0], 3) } },
    });

    expect(content(editor, ids[0])).toEqual([
      { insert: FORMULA_CHAR, attributes: { formula: 'x' } },
      { insert: 'abc' },
    ]);
  });

  it('Backspace removes the formula as a single character', () => {
    const { editor, ids } = setup(['ab']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 1, to: 1, latex: 'x' },
    });
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: ids[0], offset: 2 } });

    expect(content(editor, ids[0])).toEqual([{ insert: 'ab' }]);
  });

  it('an existing formula can be edited through setInlineAttributes', () => {
    const { editor, ids } = setup(['a']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 1, to: 1, latex: 'x' },
    });
    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[0], 1), to: p(ids[0], 2), attributes: { formula: 'y^2' } },
    });

    expect(content(editor, ids[0])[1]).toEqual({
      insert: FORMULA_CHAR,
      attributes: { formula: 'y^2' },
    });
  });
});

describe('setAlign', () => {
  it('aligns the block with the caret and uses the right prop per block type', () => {
    const { editor, ids } = setup(['a']);

    editor.dispatch({
      type: 'setAlign',
      payload: { from: p(ids[0], 0), to: p(ids[0], 0), align: 'center' },
    });
    expect(editor.document.getBlock(ids[0])!.props).toMatchObject({ alignment: 'center' });

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:heading', props: { level: 2 } },
    });
    editor.dispatch({
      type: 'setAlign',
      payload: { from: p(ids[0], 0), to: p(ids[0], 0), align: 'right' },
    });
    expect(editor.document.getBlock(ids[0])!.props).toMatchObject({ level: 2, align: 'right' });
  });

  it('aligns every alignable block of a range in one undo step and skips the others', () => {
    const { editor, ids } = setup(['a', 'b', 'c']);

    editor.dispatch({ type: 'convertBlock', payload: { blockId: ids[1], flavour: 'block:code' } });
    editor.clearHistory();

    editor.dispatch({
      type: 'setAlign',
      payload: { from: p(ids[0], 0), to: p(ids[2], 1), align: 'justify' },
    });

    expect(editor.document.getBlock(ids[0])!.props.alignment).toBe('justify');
    expect(editor.document.getBlock(ids[1])!.props.alignment).toBeUndefined();
    expect(editor.document.getBlock(ids[2])!.props.alignment).toBe('justify');

    editor.undo();
    expect(editor.document.getBlock(ids[0])!.props.alignment).toBe('left');
    expect(editor.document.getBlock(ids[2])!.props.alignment).toBe('left');
    expect(editor.canUndo).toBe(false);
  });

  it('works for quotes, list items and callouts', () => {
    for (const flavour of ['block:quote', 'block:list', 'block:callout']) {
      const { editor, ids } = setup(['x']);

      editor.dispatch({ type: 'convertBlock', payload: { blockId: ids[0], flavour } });
      editor.dispatch({
        type: 'setAlign',
        payload: { from: p(ids[0], 0), to: p(ids[0], 0), align: 'center' },
      });

      expect(editor.document.getBlock(ids[0])!.props.align, flavour).toBe('center');
    }
  });

  it('refuses unknown alignments and ranges without alignable blocks', () => {
    const { editor, ids } = setup(['a']);

    expect(
      editor.can('setAlign', { from: p(ids[0], 0), to: p(ids[0], 0), align: 'diagonal' }),
    ).toBe(false);

    editor.dispatch({ type: 'convertBlock', payload: { blockId: ids[0], flavour: 'block:code' } });
    expect(editor.can('setAlign', { from: p(ids[0], 0), to: p(ids[0], 0), align: 'center' })).toBe(
      false,
    );
  });

  it('is refused in read-only mode', () => {
    const { editor, ids } = setup(['a']);

    editor.setReadOnly(true);
    expect(editor.can('setAlign', { from: p(ids[0], 0), to: p(ids[0], 0), align: 'center' })).toBe(
      false,
    );
  });
});

describe('formatsAt: colors and alignment', () => {
  it('reports a uniform color, background and alignment', () => {
    const { editor, ids } = setup(['abcd', 'efgh']);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: p(ids[0], 0),
        to: p(ids[1], 4),
        attributes: { color: 'red', backgroundColor: 'yellow' },
      },
    });
    editor.dispatch({
      type: 'setAlign',
      payload: { from: p(ids[0], 0), to: p(ids[1], 0), align: 'center' },
    });

    expect(editor.formatsAt(p(ids[0], 0), p(ids[1], 4))).toMatchObject({
      color: 'red',
      backgroundColor: 'yellow',
      align: 'center',
    });
  });

  it('reports nothing when the selection is mixed', () => {
    const { editor, ids } = setup(['abcd', 'efgh']);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[0], 0), to: p(ids[0], 2), attributes: { color: 'red' } },
    });
    editor.dispatch({
      type: 'setAlign',
      payload: { from: p(ids[1], 0), to: p(ids[1], 0), align: 'right' },
    });

    const formats = editor.formatsAt(p(ids[0], 0), p(ids[1], 4));

    expect(formats.color).toBeUndefined();
    expect(formats.align).toBeUndefined();
    expect(editor.formatsAt(p(ids[0], 0), p(ids[0], 2)).color).toBe('red');
    expect(editor.formatsAt(p(ids[1], 1), p(ids[1], 1)).align).toBe('right');
  });

  it('color can be removed with setInlineAttributes', () => {
    const { editor, ids } = setup(['abc']);
    const range = { from: p(ids[0], 0), to: p(ids[0], 3) };

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { ...range, attributes: { color: 'blue' } },
    });
    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { ...range, attributes: { color: undefined } },
    });

    expect(content(editor, ids[0])).toEqual([{ insert: 'abc' }]);
  });
});

describe('setInlineAttributes validation', () => {
  const range = (id: BlockId, to = 3) => ({ from: p(id, 0), to: p(id, to) });

  it('accepts palette names and safe CSS colors, rejects anything that could carry styles', () => {
    const { editor, ids } = setup(['abc']);
    const can = (attributes: Record<string, string>) =>
      editor.can('setInlineAttributes', { ...range(ids[0]), attributes });

    expect(can({ color: 'red' })).toBe(true);
    expect(can({ backgroundColor: 'yellow' })).toBe(true);
    expect(can({ color: '#123456' })).toBe(true);
    expect(can({ color: 'rgb(1, 2, 3)' })).toBe(true);
    expect(can({ color: 'red; background: url(//evil)' })).toBe(false);
    expect(can({ backgroundColor: 'url(x)' })).toBe(false);
    expect(can({ color: 'var(--x)' })).toBe(false);
  });

  it('the formula attribute can only be set on formula objects, with valid code', () => {
    const { editor, ids } = setup(['abc']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 3, to: 3, latex: 'x' },
    });

    const onText = { ...range(ids[0], 2), attributes: { formula: 'y' } };
    const onObject = { from: p(ids[0], 3), to: p(ids[0], 4), attributes: { formula: 'y' } };

    expect(editor.can('setInlineAttributes', onText)).toBe(false);
    expect(editor.can('setInlineAttributes', onObject)).toBe(true);
    expect(editor.can('setInlineAttributes', { ...onObject, attributes: { formula: '  ' } })).toBe(
      false,
    );
    expect(
      editor.can('setInlineAttributes', { ...onObject, attributes: { formula: undefined } }),
    ).toBe(false);
    expect(
      editor.can('setInlineAttributes', {
        ...onObject,
        attributes: { formula: 'x'.repeat(MAX_FORMULA_LENGTH + 1) },
      }),
    ).toBe(false);
  });
});

describe('clipboard with formulas', () => {
  const fragmentOf = (editor: Editor, from: ReturnType<typeof p>, to: ReturnType<typeof p>) =>
    editor.copyFragment(from, to);

  it('plain text and HTML carry the LaTeX source, not the object character', () => {
    const { editor, ids } = setup(['E = ']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 4, to: 4, latex: 'mc^2' },
    });

    const fragment = fragmentOf(editor, p(ids[0], 0), p(ids[0], 5));

    expect(fragmentToPlainText(fragment)).toBe('E = mc^2');
    expect(fragmentToHtml(fragment)).toContain('<span class="math inline">\\(mc^2\\)</span>');
    expect(fragmentToHtml(fragment)).not.toContain(FORMULA_CHAR);
  });

  it('colors are exported as inline styles', () => {
    const { editor, ids } = setup(['abc']);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: p(ids[0], 0),
        to: p(ids[0], 3),
        attributes: { color: 'red', backgroundColor: 'yellow' },
      },
    });

    expect(fragmentToHtml(fragmentOf(editor, p(ids[0], 0), p(ids[0], 3)))).toContain(
      '<span style="color:#e5192b;background-color:#ffe74a">abc</span>',
    );
  });

  it('a formula survives the clipboard round trip', () => {
    const { editor, ids } = setup(['ab']);

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: ids[0], from: 1, to: 1, latex: 'x^2' },
    });

    const fragment = sanitizeFragment(
      JSON.parse(JSON.stringify(fragmentOf(editor, p(ids[0], 0), p(ids[0], 3)))),
    )!;

    expect(fragment.blocks[0].content).toEqual([
      { insert: 'a' },
      { insert: FORMULA_CHAR, attributes: { formula: 'x^2' } },
      { insert: 'b' },
    ]);
  });

  it('pasted data cannot smuggle object characters or formulas on ordinary text', () => {
    const raw = {
      blocks: [
        {
          flavour: 'block:paragraph',
          props: {},
          children: [],
          content: [
            { insert: `a${FORMULA_CHAR}b` },
            { insert: 'plain', attributes: { formula: 'x' } },
            { insert: FORMULA_CHAR, attributes: { formula: '' } },
            { insert: FORMULA_CHAR, attributes: { formula: 'ok' } },
            { insert: FORMULA_CHAR, attributes: { formula: 'x'.repeat(MAX_FORMULA_LENGTH + 1) } },
          ],
        },
      ],
    };

    const [block] = sanitizeFragment(raw)!.blocks;

    expect(block.content).toEqual([
      { insert: 'ab' },
      { insert: 'plain' },
      { insert: FORMULA_CHAR, attributes: { formula: 'ok' } },
    ]);
  });
});
