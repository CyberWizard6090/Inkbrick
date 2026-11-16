import { beforeAll, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider } from '../src';
import { isDefaultHighlighterLoaded, loadDefaultHighlighter } from '../src/code/lazyHighlight';
import { preloadContextMenu } from '../src/context-menu/ContextMenuHost';
import { preloadFormulaPalette } from '../src/formula/LazyFormulaPalette';

// Другие ленивые чанки DocumentView грузит при монтировании: загружаем их заранее, чтобы не оборвать при завершении теста.
beforeAll(async () => {
  await Promise.all([preloadContextMenu(), preloadFormulaPalette()]);
});

describe('default highlighter loaded on demand', () => {
  it('shows plain code first and colours it once the highlighter chunk is loaded', async () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const id = editor.document.getBlock(note)!.children[0];

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: id, flavour: 'block:code', props: { language: 'javascript' } },
    });
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: id, from: 0, to: 0, text: 'const x = 1;' },
    });

    expect(isDefaultHighlighterLoaded()).toBe(false);

    const view = render(
      <EditorProvider editor={editor} formulaRenderer={false}>
        <DocumentView />
      </EditorProvider>,
    );
    const code = () => view.container.querySelector<HTMLElement>(`.editable[data-id="${id}"]`)!;

    expect(code().textContent).toBe('const x = 1;');
    expect(code().querySelector('[data-inkbrick-token]')).toBeNull();

    await act(async () => {
      await loadDefaultHighlighter();
    });

    expect(code().querySelector('[data-inkbrick-token="keyword"]')?.textContent).toBe('const');
    expect(code().textContent).toBe('const x = 1;');
  });
});
