import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider, type CodeHighlighter } from '../src';
import { readDocSelection } from '../src/editing/selection';
import { normalizeTokens, renderCode } from '../src/editing/renderCode';

const CODE = "const answer = 42; // ok\nreturn 'x';";

function codeEditor(language = 'typescript', text = CODE) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];

  editor.dispatch({
    type: 'convertBlock',
    payload: { blockId: first, flavour: 'block:code', props: { language } },
  });
  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: first, from: 0, to: 0, text },
  });

  return { editor, blockId: first };
}

const mount = (editor: Editor, props: Record<string, unknown> = {}) =>
  render(
    <EditorProvider editor={editor} {...props}>
      <DocumentView />
    </EditorProvider>,
  );

const tokens = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-inkbrick-token]')].map((node) => [
    node.textContent,
    node.getAttribute('data-inkbrick-token'),
  ]);

describe('code block rendering', () => {
  it('wraps tokens in spans and keeps the text exactly as in the model', () => {
    const { editor } = codeEditor();
    const { container } = mount(editor);
    const content = container.querySelector(
      '[data-inkbrick-block="code"] [data-inkbrick-part="content"]',
    )!;

    expect(content.textContent).toBe(CODE);
    expect(tokens(container)).toEqual(
      expect.arrayContaining([
        ['const', 'keyword'],
        ['42', 'number'],
        ['// ok', 'comment'],
        ['return', 'keyword'],
        ["'x'", 'string'],
      ]),
    );
  });

  it('re-highlights when the text or the language changes', () => {
    const { editor, blockId } = codeEditor('typescript', 'let a');
    const { container } = mount(editor);

    expect(tokens(container)).toEqual([['let', 'keyword']]);

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId, from: 5, to: 5, text: ' = 1' },
      });
    });
    expect(tokens(container)).toContainEqual(['1', 'number']);

    act(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId, props: { language: 'plain' } },
      });
    });
    expect(tokens(container)).toEqual([]);
    expect(container.querySelector('[data-inkbrick-part="content"]')!.textContent).toBe(
      'let a = 1',
    );
  });

  it('highlighter={false} turns highlighting off', () => {
    const { editor } = codeEditor();
    const { container } = mount(editor, { highlighter: false });

    expect(tokens(container)).toEqual([]);
    expect(container.querySelector('[data-inkbrick-part="content"]')!.textContent).toBe(CODE);
  });

  it('accepts a custom highlighter and custom token types', () => {
    const calls: Array<[string, string]> = [];
    const custom: CodeHighlighter = (code, language) => {
      calls.push([code, language]);

      return [{ from: 0, to: 5, type: 'shout' }];
    };
    const { editor } = codeEditor('python', 'hello world');
    const { container } = mount(editor, { highlighter: custom });

    expect(calls.at(-1)).toEqual(['hello world', 'python']);
    expect(tokens(container)).toEqual([['hello', 'shout']]);
  });

  it('a broken custom highlighter cannot change the text or inject markup', () => {
    const evil: CodeHighlighter = () => [
      { from: 3, to: 99, type: 'keyword' },
      { from: -5, to: 2, type: 'keyword' },
      { from: 0, to: 4, type: 'bad type" onclick="x' },
      { from: 2, to: 2, type: 'keyword' },
      { from: 1.5, to: 3, type: 'keyword' },
      { from: 0, to: 3, type: 'string' },
      { from: 2, to: 5, type: 'number' },
    ];
    const { editor } = codeEditor('typescript', 'abcdef');
    const { container } = mount(editor, { highlighter: evil });

    expect(container.querySelector('[data-inkbrick-part="content"]')!.textContent).toBe('abcdef');
    expect(container.innerHTML).not.toContain('onclick');
    expect(tokens(container)).toEqual([['abc', 'string']]);
  });

  it('a highlighter that throws does not break the editor: the text is shown plain', () => {
    const failing: CodeHighlighter = () => {
      throw new Error('boom');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { editor } = codeEditor('typescript', 'let a = 1');
    const { container } = mount(editor, { highlighter: failing });

    expect(container.querySelector('[data-inkbrick-part="content"]')!.textContent).toBe(
      'let a = 1',
    );
    expect(tokens(container)).toEqual([]);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('does not highlight other blocks or blocks with formatted text', () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'const x = 1' },
    });

    const { container } = mount(editor);

    expect(tokens(container)).toEqual([]);
  });

  it('the copy button puts the code on the clipboard', async () => {
    const written: string[] = [];

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
    });

    const { editor } = codeEditor();
    const { container } = mount(editor);
    const button = container.querySelector<HTMLButtonElement>('[data-inkbrick-part="copy"]')!;

    await act(async () => {
      button.click();
    });

    expect(written).toEqual([CODE]);
    expect(button.getAttribute('data-state')).toBe('copied');
  });
});

describe('selection inside highlighted code', () => {
  it('reports document offsets correctly across token spans', () => {
    const { editor, blockId } = codeEditor('typescript', 'let value = 10;');
    const { container } = mount(editor);
    const root = container.querySelector<HTMLElement>('[data-inkbrick-root]')!;
    const spans = [...root.querySelectorAll('[data-inkbrick-token]')];
    const number = spans.find((node) => node.textContent === '10')!.firstChild!;
    const range = document.createRange();

    range.setStart(number, 0);
    range.setEnd(number, 2);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    expect(readDocSelection(root)).toMatchObject({
      from: { blockId, offset: 12 },
      to: { blockId, offset: 14 },
      collapsed: false,
    });
  });
});

describe('normalizeTokens / renderCode', () => {
  it('sorts, clips and drops overlapping or invalid tokens', () => {
    expect(
      normalizeTokens(
        [
          { from: 4, to: 6, type: 'b' },
          { from: 0, to: 2, type: 'a' },
          { from: 1, to: 5, type: 'overlap' },
          { from: 0, to: 99, type: 'out' },
          { from: 3, to: 3, type: 'empty' },
          { from: 2, to: 3, type: 'Upper' },
        ],
        6,
      ),
    ).toEqual([
      { from: 0, to: 2, type: 'a' },
      { from: 4, to: 6, type: 'b' },
    ]);
  });

  it('adds a trailing <br> for an empty text or a final newline, like renderInline', () => {
    const root = document.createElement('div');

    renderCode(root, '', []);
    expect(root.innerHTML).toBe('<br>');

    renderCode(root, 'a\n', [{ from: 0, to: 1, type: 'keyword' }]);
    expect(root.innerHTML).toBe('<span data-inkbrick-token="keyword">a</span>\n<br>');
    expect(root.textContent).toBe('a\n');
  });
});
