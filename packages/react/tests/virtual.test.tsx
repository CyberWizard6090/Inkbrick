import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

import {
  createSchemaRegistry,
  deserializeDocument,
  type DocumentSnapshot,
} from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  EditorView,
  virtualRenderer,
  type DocumentViewProps,
} from '../src';
import { EditorViewContext } from '../src/context/EditorContext';
import { readDocSelection, selectAllText } from '../src/editing/selection';
import { ViewportController } from '../src/editing/ViewportController';

const schema = createSchemaRegistry();

function editorWith(count: number): Editor {
  const blocks: DocumentSnapshot['blocks'] = {
    root: {
      id: 'root',
      flavour: 'block:page',
      parentId: null,
      children: ['note'],
      content: [],
      props: {},
    },
    note: {
      id: 'note',
      flavour: 'block:note',
      parentId: 'root',
      children: [],
      content: [],
      props: {},
    },
  };

  for (let i = 0; i < count; i++) {
    blocks[`b${i}`] = {
      id: `b${i}`,
      flavour: 'block:paragraph',
      parentId: 'note',
      children: [],
      content: [{ insert: `Paragraph ${i}` }],
      props: {},
    };
    blocks.note.children.push(`b${i}`);
  }

  return new Editor({
    schema,
    document: deserializeDocument({ rootId: 'root', blocks }, { schema }),
  });
}

function mount(editor: Editor, renderer?: DocumentViewProps['renderer']) {
  let view: EditorView | null = null;

  function Capture() {
    return (
      <EditorViewContext.Consumer>
        {(value) => {
          view = value;
          return null;
        }}
      </EditorViewContext.Consumer>
    );
  }

  const result = render(
    <EditorProvider editor={editor} formulaRenderer={false} highlighter={false}>
      <Capture />
      <DocumentView renderer={renderer} />
    </EditorProvider>,
  );

  return { ...result, view: () => view! };
}

const ids = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.editable[data-id]')].map((el) => el.dataset.id);

describe('virtual renderer', () => {
  it('renders every block by default', () => {
    const { container } = mount(editorWith(300));

    expect(ids(container)).toHaveLength(300);
    expect(container.querySelector('[data-inkbrick-spacer]')).toBeNull();
  });

  it('renders only the blocks near the viewport plus the first and the last one', () => {
    const { container } = mount(editorWith(5000), 'virtual');
    const rendered = ids(container);

    expect(rendered.length).toBeGreaterThan(10);
    expect(rendered.length).toBeLessThan(300);
    expect(rendered[0]).toBe('b0');
    expect(rendered.at(-1)).toBe('b4999');

    const gap = container.querySelector<HTMLElement>('.inkbrick-spacer[style]');

    expect(gap?.getAttribute('contenteditable')).toBe('false');
    expect(gap?.getAttribute('aria-hidden')).toBe('true');
    expect(parseFloat(gap!.style.height)).toBeGreaterThan(1000);
  });

  it('draws short lists as usual (below the threshold)', () => {
    const { container } = mount(editorWith(50), virtualRenderer({ threshold: 100 }));

    expect(ids(container)).toHaveLength(50);
    expect(container.querySelector('[data-inkbrick-spacer]')).toBeNull();
  });

  it('reveals a block outside the window before placing the caret in it', async () => {
    const { container, view } = mount(editorWith(5000), 'virtual');

    expect(ids(container)).not.toContain('b3000');

    act(() => view().placeCaret('b3000', 4));

    await waitFor(() => expect(ids(container)).toContain('b3000'));

    const root = container.querySelector<HTMLElement>('.inkbrick-editor')!;

    expect(readDocSelection(root)).toMatchObject({
      from: { blockId: 'b3000', offset: 4 },
      collapsed: true,
    });
  });

  it('keeps the blocks at the edges of the selection rendered', async () => {
    const editor = editorWith(5000);
    const { container, view } = mount(editor, 'virtual');

    act(() => view().placeCaret('b2500', 0));
    await waitFor(() => expect(ids(container)).toContain('b2500'));

    act(() => view().viewport.reveal([]));
    await waitFor(() => expect(view().viewport.getPinned()).toEqual(['b2500']));
    expect(ids(container)).toContain('b2500');
  });

  it('Ctrl+A covers the whole document, not only the rendered window', () => {
    const editor = editorWith(5000);
    const { container } = mount(editor, 'virtual');
    const root = container.querySelector<HTMLElement>('.inkbrick-editor')!;

    act(() => {
      selectAllText(root);
    });

    const selection = readDocSelection(root)!;

    expect(selection.from.blockId).toBe('b0');
    expect(selection.to.blockId).toBe('b4999');
    expect(editor.copyFragment(selection.from, selection.to).blocks).toHaveLength(5000);
  });

  it('keeps editing working: a new block in the window is drawn at once', () => {
    const editor = editorWith(5000);
    const { container } = mount(editor, 'virtual');

    act(() => {
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: 'b1' },
      });
    });

    const rendered = ids(container);

    expect(rendered.slice(0, 3)).toEqual(['b0', 'b1', expect.any(String)]);
    expect(rendered[2]).not.toBe('b2');
  });
});

describe('ViewportController', () => {
  it('notifies only on changes and reveals only when a virtual list is mounted', () => {
    const c = new ViewportController();
    let calls = 0;
    c.subscribe(() => calls++);

    expect(c.reveal(['a'])).toBe(false);

    const detach = c.attach();

    expect(c.reveal(['a'])).toBe(true);
    c.setEdges(['x', 'y']);
    c.setEdges(['x', 'y']);
    expect(calls).toBe(2);
    expect(c.getPinned()).toEqual(['x', 'y', 'a']);

    detach();
    expect(c.virtual).toBe(false);
  });
});
