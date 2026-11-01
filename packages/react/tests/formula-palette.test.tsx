import { describe, expect, it } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider, en, ru, type FormulaRenderer } from '../src';
import { applySnippet, CARET } from '../src/formula/snippet';
import { SYMBOL_CATEGORIES } from '../src/formula/symbols';

const noRender: FormulaRenderer = () => undefined;

describe('applySnippet', () => {
  it('inserts the template at the caret and puts the cursor on the marker', () => {
    expect(applySnippet('a+b', 1, 1, `\\sin(${CARET})`)).toEqual({ value: 'a\\sin()+b', caret: 6 });
  });

  it('puts the selected text into the marker (wraps it)', () => {
    expect(applySnippet('x+1', 0, 3, `\\sqrt{${CARET}}`)).toEqual({
      value: '\\sqrt{x+1}',
      caret: 9,
    });
  });

  it('replaces the selection when the template has no marker; the cursor goes to the end', () => {
    expect(applySnippet('a b c', 2, 3, '\\alpha ')).toEqual({ value: 'a \\alpha  c', caret: 9 });
  });

  it('tolerates reversed or out-of-range selections and extra markers', () => {
    expect(applySnippet('abc', 3, 1, `[${CARET}]`).value).toBe('a[bc]');
    expect(applySnippet('abc', 10, 20, 'x').value).toBe('abcx');
    expect(applySnippet('', 0, 0, `${CARET}a${CARET}`).value).toBe('a');
  });
});

describe('symbol palette data', () => {
  const all = SYMBOL_CATEGORIES.flatMap((category) => category.items);

  it('has the categories the UI names, each with a translation in every built-in dictionary', () => {
    for (const { id } of SYMBOL_CATEGORIES) {
      expect(en[`formula.palette.${id}`], id).toBeTruthy();
      expect(ru[`formula.palette.${id}`], id).toBeTruthy();
    }
  });

  it('covers the requested groups: trigonometry, Greek letters, operators and structures', () => {
    const snippets = all.map((item) => item.snippet);

    for (const fn of ['sin', 'cos', 'tan']) expect(snippets).toContain(`\\${fn}(${CARET})`);

    expect(snippets).toEqual(
      expect.arrayContaining(['\\alpha ', '\\pi ', '\\Omega ', '\\sum_{i=1}^{n} ⌖', '\\infty ']),
    );
    expect(all.length).toBeGreaterThan(150);
  });

  it('every item is well-formed: label, one marker at most, no duplicates inside a category', () => {
    for (const category of SYMBOL_CATEGORIES) {
      const seen = new Set<string>();

      for (const item of category.items) {
        expect(item.label, category.id).not.toBe('');
        expect(item.snippet.split(CARET).length - 1, item.snippet).toBeLessThanOrEqual(1);
        expect(seen.has(item.snippet), `${category.id}: ${item.snippet}`).toBe(false);
        seen.add(item.snippet);
      }
    }
  });

  it('commands that are not followed by a bracket end with a space, so the next letter cannot glue to them', () => {
    for (const item of all) {
      const bare = /^\\[A-Za-z]+$/.test(item.snippet);

      expect(bare, item.snippet).toBe(false);
    }
  });
});

describe('palette in the formula block editor', () => {
  const mount = async () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: first, flavour: 'block:formula', props: { latex: 'x' } },
    });

    const view = render(
      <EditorProvider editor={editor} formulaRenderer={noRender}>
        <DocumentView />
      </EditorProvider>,
    );

    fireEvent.click(view.container.querySelector('[data-inkbrick-part="formula-display"]')!);

    const field = view.container.querySelector<HTMLTextAreaElement>(
      '[data-inkbrick-part="formula-source"]',
    )!;
    // Шаблоны содержат «\» и скобки — в селектор их не вставить, ищем по dataset.
    const symbol = (snippet: string) =>
      [
        ...view.container.querySelectorAll<HTMLButtonElement>(
          '[data-inkbrick-part="formula-symbol"]',
        ),
      ].find((button) => button.dataset.snippet === snippet)!;

    await waitFor(() =>
      expect(view.container.querySelector('[data-inkbrick-part="formula-palette"]')).not.toBeNull(),
    );

    return { ...view, editor, first, field, symbol };
  };

  it('shows the palette with the first category open and switches categories', async () => {
    const { container, symbol } = await mount();

    expect(symbol(`\\sin(${CARET})`)).not.toBeNull();

    fireEvent.click(container.querySelector('[data-category="greek"]')!);

    expect(symbol('\\alpha ')).not.toBeNull();
    expect(
      container.querySelector(
        `[data-inkbrick-part="formula-symbol"][data-snippet="\\sin(${CARET})"]`,
      ),
    ).toBeNull();
    expect(container.querySelector('[data-category="greek"]')!.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('inserting a template changes the draft, keeps the editor open and puts the caret inside the brackets', async () => {
    const { field, symbol, editor, first } = await mount();

    field.focus();
    field.setSelectionRange(1, 1);
    fireEvent.click(symbol(`\\sin(${CARET})`));

    expect(field.value).toBe('x\\sin()');
    expect(field.selectionStart).toBe(6);
    expect(editor.document.getBlock(first)!.props.latex).toBe('x');
  });

  it('wraps the selected text', async () => {
    const { container, field, symbol } = await mount();

    fireEvent.click(container.querySelector('[data-category="structures"]')!);
    field.focus();
    field.setSelectionRange(0, 1);
    fireEvent.click(symbol(`\\sqrt{${CARET}}`));

    expect(field.value).toBe('\\sqrt{x}');
  });

  it('moving focus to a palette button does not close or commit the editor; leaving the editor does', async () => {
    const { container, field, symbol, editor, first } = await mount();

    field.focus();
    fireEvent.change(field, { target: { value: 'y' } });
    fireEvent.blur(field, { relatedTarget: symbol(`\\sin(${CARET})`) });

    expect(container.querySelector('[data-inkbrick-part="formula-source"]')).not.toBeNull();
    expect(editor.document.getBlock(first)!.props.latex).toBe('x');

    fireEvent.blur(field, { relatedTarget: document.body });

    expect(editor.document.getBlock(first)!.props.latex).toBe('y');
    expect(container.querySelector('[data-inkbrick-part="formula-source"]')).toBeNull();
  });

  it('mouse down on the palette does not take the focus away from the field', async () => {
    const { symbol } = await mount();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

    symbol(`\\sin(${CARET})`).dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
  });
});
