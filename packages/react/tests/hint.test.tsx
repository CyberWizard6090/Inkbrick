// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider } from '../src';
import { CaretController } from '../src/editing/CaretController';

const render = (props: Record<string, unknown> = {}, editor = new Editor()) =>
  renderToString(
    <EditorProvider editor={editor} {...props}>
      <DocumentView />
    </EditorProvider>,
  );

const count = (html: string, text: string) => html.split(text).length - 1;

describe('empty block hint', () => {
  it('blocks no longer carry their own placeholders', () => {
    expect(render()).not.toContain('data-placeholder');
  });

  it('one shared hint text is offered on editable blocks', () => {
    expect(count(render(), 'data-hint="Press / to open the menu"')).toBe(1);
  });

  it('is not offered in read-only mode, without the slash menu, or in code blocks', () => {
    expect(render({ readOnly: true })).not.toContain('data-hint');
    expect(render({ slashItems: false })).not.toContain('data-hint');

    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: first, flavour: 'block:code' },
    });

    expect(render({}, editor)).not.toContain('data-hint');
  });

  it('an explicit Editable placeholder is still supported for custom blocks', async () => {
    const { Editable } = await import('../src');
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const block = editor.document.getBlock(editor.document.getBlock(note)!.children[0])!;

    const html = renderToString(
      <EditorProvider editor={editor}>
        <Editable block={block} placeholder="Type here" />
      </EditorProvider>,
    );

    expect(html).toContain('data-placeholder="Type here"');
  });
});

describe('CaretController', () => {
  it('tracks one block and notifies only on change', () => {
    const caret = new CaretController();
    let calls = 0;

    caret.subscribe(() => calls++);

    expect(caret.has('a')).toBe(false);

    caret.set('a');
    caret.set('a');
    expect(caret.has('a')).toBe(true);
    expect(calls).toBe(1);

    caret.set('b');
    expect(caret.has('a')).toBe(false);
    expect(caret.has('b')).toBe(true);

    caret.set(null);
    expect(caret.has('b')).toBe(false);
    expect(calls).toBe(3);
  });
});
