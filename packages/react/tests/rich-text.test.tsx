import { describe, expect, it } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { FORMULA_CHAR } from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider, mountFormula, type FormulaRenderer } from '../src';
import { matchInlineFormula } from '../src/formula/actions';
import { renderInline } from '../src/editing/renderInline';
import { readDocSelection } from '../src/editing/selection';

const text = (insert: string, attributes?: Record<string, string | boolean>) =>
  attributes ? { insert, attributes } : { insert };

function fakeRenderer() {
  const calls: Array<[string, boolean]> = [];
  const renderer: FormulaRenderer = (latex, target, { display }) => {
    calls.push([latex, display]);

    if (latex.includes('boom')) throw new Error('bad latex');

    target.textContent = `«${latex}»`;
  };

  return { renderer, calls };
}

function setup() {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];

  return { editor, first };
}

const mount = (editor: Editor, props: Record<string, unknown> = {}) =>
  render(
    <EditorProvider editor={editor} {...props}>
      <DocumentView />
    </EditorProvider>,
  );

describe('renderInline: colors', () => {
  const paint = (attributes: Record<string, string>) => {
    const root = document.createElement('div');

    renderInline(root, [text('x', attributes)]);

    return root.firstElementChild as HTMLElement;
  };

  it('palette names become attributes (the theme picks the shade)', () => {
    const span = paint({ color: 'red', backgroundColor: 'yellow' });

    expect(span.getAttribute('data-inkbrick-color')).toBe('red');
    expect(span.getAttribute('data-inkbrick-bg')).toBe('yellow');
    expect(span.getAttribute('style')).toBeNull();
  });

  it('safe CSS colors still work as inline styles', () => {
    const span = paint({ color: '#123456', backgroundColor: 'rgb(1, 2, 3)' });

    expect(span.style.color).toBe('rgb(18, 52, 86)');
    expect(span.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('unsafe values are ignored', () => {
    const root = document.createElement('div');

    renderInline(root, [
      text('x', { color: 'red; background: url(//evil)', backgroundColor: 'url(x)' }),
    ]);

    expect(root.innerHTML).toBe('x');
  });
});

describe('renderInline: inline formulas', () => {
  it('a formula is one non-editable object of exactly one character', async () => {
    const { renderer } = fakeRenderer();
    const root = document.createElement('div');

    renderInline(root, [text('a '), text(FORMULA_CHAR, { formula: 'x^2' }), text(' b')], {
      formulaRenderer: renderer,
    });

    const host = root.querySelector('[data-inkbrick-formula]') as HTMLElement;

    expect(host.getAttribute('contenteditable')).toBe('false');
    expect(host.getAttribute('data-latex')).toBe('x^2');
    expect(host.shadowRoot).not.toBeNull();
    expect(host.textContent).toBe(FORMULA_CHAR);
    expect(root.textContent).toBe(`a ${FORMULA_CHAR} b`);
    await waitFor(() => expect(host.shadowRoot!.textContent).toContain('«x^2»'));
  });

  it('a node of several objects renders one formula per character', () => {
    const root = document.createElement('div');

    renderInline(root, [text(FORMULA_CHAR.repeat(3), { formula: 'y' })]);

    expect(root.querySelectorAll('[data-inkbrick-formula]')).toHaveLength(3);
    expect(root.textContent).toBe(FORMULA_CHAR.repeat(3));
  });

  it('formatting wraps the formula', () => {
    const root = document.createElement('div');

    renderInline(root, [text(FORMULA_CHAR, { formula: 'y', bold: true })]);

    expect(root.querySelector('strong > [data-inkbrick-formula]')).not.toBeNull();
  });

  it('without a renderer the source is shown and the state says so', () => {
    const root = document.createElement('div');

    renderInline(root, [text(FORMULA_CHAR, { formula: 'x+1' })], { formulaRenderer: null });

    const host = root.querySelector('[data-inkbrick-formula]') as HTMLElement;

    expect(host.shadowRoot!.textContent).toContain('x+1');
    expect(host.getAttribute('data-state')).toBe('source');
  });

  it('a failing formula reports the error state and keeps showing the source', async () => {
    const { renderer } = fakeRenderer();
    const root = document.createElement('div');

    renderInline(root, [text(FORMULA_CHAR, { formula: 'boom' })], { formulaRenderer: renderer });

    const host = root.querySelector('[data-inkbrick-formula]') as HTMLElement;

    await waitFor(() => expect(host.getAttribute('data-state')).toBe('error'));
    expect(host.shadowRoot!.textContent).toContain('boom');
  });

  it('offsets of the selection count the formula as one character', () => {
    const { editor, first } = setup();

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'ab' },
    });
    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: first, from: 1, to: 1, latex: 'x^2' },
    });

    const { container } = mount(editor, { formulaRenderer: fakeRenderer().renderer });
    const root = container.querySelector<HTMLElement>('[data-inkbrick-root]')!;
    const content = root.querySelector('[data-inkbrick-part="content"]')!;
    const range = document.createRange();

    range.setStart(content.lastChild!, 1);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    expect(content.textContent).toBe(`a${FORMULA_CHAR}b`);
    expect(readDocSelection(root)).toMatchObject({
      from: { blockId: first, offset: 3 },
      collapsed: true,
    });
  });
});

describe('mountFormula', () => {
  it('caches results: the second identical formula is rendered synchronously', async () => {
    const { renderer, calls } = fakeRenderer();
    const first = document.createElement('span');
    const second = document.createElement('span');

    mountFormula(first, 'a+b', { display: false, renderer });
    await waitFor(() => expect(first.getAttribute('data-state')).toBe('ready'));

    mountFormula(second, 'a+b', { display: false, renderer });

    expect(second.getAttribute('data-state')).toBe('ready');
    expect(second.textContent).toBe('«a+b»');
    expect(calls).toHaveLength(1);
  });

  it('inline and display are cached separately', async () => {
    const { renderer, calls } = fakeRenderer();
    const target = document.createElement('div');

    mountFormula(target, 'z', { display: false, renderer });
    await waitFor(() => expect(target.getAttribute('data-state')).toBe('ready'));
    mountFormula(target, 'z', { display: true, renderer });

    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it('a cancelled mount never writes a stale result', async () => {
    let finish: () => void = () => undefined;
    const slow: FormulaRenderer = (latex, target) =>
      new Promise<void>((resolve) => {
        finish = () => {
          target.textContent = `late:${latex}`;
          resolve();
        };
      });
    const target = document.createElement('span');
    const cancel = mountFormula(target, 'x', { display: false, renderer: slow });

    cancel();
    finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(target.textContent).toBe('x');
    expect(target.getAttribute('data-state')).toBe('loading');
  });

  it('empty code and a missing renderer are handled without calling anything', () => {
    const { renderer, calls } = fakeRenderer();
    const empty = document.createElement('span');
    const plain = document.createElement('span');

    mountFormula(empty, '   ', { display: false, renderer });
    mountFormula(plain, 'q', { display: false, renderer: null });

    expect(empty.getAttribute('data-state')).toBe('empty');
    expect(plain.getAttribute('data-state')).toBe('source');
    expect(plain.textContent).toBe('q');
    expect(calls).toHaveLength(0);
  });
});

describe('matchInlineFormula', () => {
  it('finds $code$ typed before the closing dollar', () => {
    expect(matchInlineFormula('a $x^2')).toEqual({ from: 2, latex: 'x^2' });
    expect(matchInlineFormula('$a+b')).toEqual({ from: 0, latex: 'a+b' });
  });

  it('keeps prices and escaped dollars as text', () => {
    expect(matchInlineFormula('costs $5 and ')).toBeNull(); // «5 and » кончается пробелом
    expect(matchInlineFormula('$ x')).toBeNull(); // начинается с пробела
    expect(matchInlineFormula('plain')).toBeNull();
    expect(matchInlineFormula('a \\$x')).toBeNull();
    expect(matchInlineFormula('$')).toBeNull();
    expect(matchInlineFormula(`$a${FORMULA_CHAR}b`)).toBeNull();
  });
});

describe('FormulaBlock', () => {
  const formulaEditor = (latex: string) => {
    const { editor, first } = setup();

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: first, flavour: 'block:formula', props: { latex } },
    });

    return { editor, first };
  };

  it('shows the rendered formula and opens the editor on click', async () => {
    const { renderer } = fakeRenderer();
    const { editor, first } = formulaEditor('E=mc^2');
    const { container } = mount(editor, { formulaRenderer: renderer });

    await waitFor(() =>
      expect(container.querySelector('[data-inkbrick-part="formula-render"]')!.textContent).toBe(
        '«E=mc^2»',
      ),
    );

    fireEvent.click(container.querySelector('[data-inkbrick-part="formula-display"]')!);

    const field = container.querySelector<HTMLTextAreaElement>(
      '[data-inkbrick-part="formula-source"]',
    )!;

    expect(field.value).toBe('E=mc^2');
    expect(
      container.querySelector(`[data-block-id="${first}"]`)!.getAttribute('data-inkbrick-block'),
    ).toBe('formula');
  });

  it('commits the draft to props on blur and cancels on Escape', () => {
    const { renderer } = fakeRenderer();
    const { editor, first } = formulaEditor('a');
    const { container } = mount(editor, { formulaRenderer: renderer });

    fireEvent.click(container.querySelector('[data-inkbrick-part="formula-display"]')!);

    const field = () =>
      container.querySelector<HTMLTextAreaElement>('[data-inkbrick-part="formula-source"]')!;

    fireEvent.change(field(), { target: { value: 'b' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(editor.document.getBlock(first)!.props.latex).toBe('a');

    fireEvent.click(container.querySelector('[data-inkbrick-part="formula-display"]')!);
    fireEvent.change(field(), { target: { value: 'c^2' } });
    fireEvent.blur(field());
    expect(editor.document.getBlock(first)!.props.latex).toBe('c^2');
  });

  it('an empty block opens straight into the editor; read-only shows no editor', () => {
    const { renderer } = fakeRenderer();
    const { editor } = formulaEditor('');
    const view = mount(editor, { formulaRenderer: renderer });

    expect(view.container.querySelector('[data-inkbrick-part="formula-source"]')).not.toBeNull();
    view.unmount();

    const readOnly = mount(editor, { formulaRenderer: renderer, readOnly: true });

    expect(readOnly.container.querySelector('[data-inkbrick-part="formula-source"]')).toBeNull();
    expect(
      readOnly.container.querySelector<HTMLButtonElement>('[data-inkbrick-part="formula-empty"]')!
        .disabled,
    ).toBe(true);
  });

  it('shows the parse error of a bad formula in the live preview', async () => {
    const { renderer } = fakeRenderer();
    const { editor } = formulaEditor('');
    const { container } = mount(editor, { formulaRenderer: renderer });
    const field = container.querySelector<HTMLTextAreaElement>(
      '[data-inkbrick-part="formula-source"]',
    )!;

    fireEvent.change(field, { target: { value: 'boom' } });

    await waitFor(() =>
      expect(container.querySelector('[data-inkbrick-part="formula-error"]')!.textContent).toBe(
        'bad latex',
      ),
    );
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('alignment attributes', () => {
  it('blocks expose data-align from their props', () => {
    const { editor, first } = setup();

    editor.dispatch({
      type: 'setAlign',
      payload: {
        from: { blockId: first, offset: 0 },
        to: { blockId: first, offset: 0 },
        align: 'center',
      },
    });

    const { container } = mount(editor);

    expect(
      container.querySelector('[data-inkbrick-block="paragraph"]')!.getAttribute('data-align'),
    ).toBe('center');
  });

  it('every alignable block type renders data-align', () => {
    for (const flavour of ['block:heading', 'block:quote', 'block:list', 'block:callout']) {
      const { editor, first } = setup();

      editor.dispatch({ type: 'convertBlock', payload: { blockId: first, flavour } });
      editor.dispatch({
        type: 'setAlign',
        payload: {
          from: { blockId: first, offset: 0 },
          to: { blockId: first, offset: 0 },
          align: 'right',
        },
      });

      const { container, unmount } = mount(editor);

      expect(
        container
          .querySelector(`[data-inkbrick-block="${flavour.replace('block:', '')}"]`)!
          .getAttribute('data-align'),
        flavour,
      ).toBe('right');
      unmount();
    }
  });
});

describe('EditorProvider.formulaRenderer', () => {
  it('false shows only the source of every formula', () => {
    const { editor, first } = setup();

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: first, from: 0, to: 0, latex: 'x+1' },
    });

    const { container } = mount(editor, { formulaRenderer: false });
    const host = container.querySelector('[data-inkbrick-formula]') as HTMLElement;

    expect(host.getAttribute('data-state')).toBe('source');
    expect(host.shadowRoot!.textContent).toContain('x+1');
  });

  it('a custom renderer is used for inline formulas', async () => {
    const { renderer, calls } = fakeRenderer();
    const { editor, first } = setup();

    editor.dispatch({
      type: 'insertFormula',
      payload: { blockId: first, from: 0, to: 0, latex: 'y^3' },
    });
    mount(editor, { formulaRenderer: renderer });

    await waitFor(() => expect(calls).toContainEqual(['y^3', false]));
  });
});
