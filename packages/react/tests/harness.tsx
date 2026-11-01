import { act, render } from '@testing-library/react';

import type { BlockId } from '@inkbrick/document';
import { Editor, type CaretResult } from '@inkbrick/engine';

import { DocumentView, EditorProvider, type EditorProviderProps } from '../src';

// jsdom не считает раскладку и не знает CSS.escape: заглушки, которых достаточно для логики редактора.
const emptyRect = () => new DOMRect(0, 0, 0, 0);

Range.prototype.getBoundingClientRect ??= emptyRect;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
globalThis.CSS ??= {} as typeof CSS;
CSS.escape ??= (value: string) => value.replace(/["\\]/g, '\\$&');

export function mountEditor(
  texts: string[] = [''],
  props: Partial<Omit<EditorProviderProps, 'editor' | 'children'>> = {},
) {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(noteId)!.children[0]];

  for (let i = 1; i < texts.length; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
        }) as CaretResult
      ).blockId,
    );
  }

  texts.forEach((text, i) => {
    if (text)
      editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } });
  });
  editor.clearHistory();

  const view = render(
    <EditorProvider editor={editor} formulaRenderer={false} highlighter={false} {...props}>
      <DocumentView />
    </EditorProvider>,
  );
  const root = view.container.querySelector<HTMLElement>('[data-inkbrick-root]')!;

  const editable = (blockId: BlockId) =>
    root.querySelector<HTMLElement>(`.editable[data-id="${blockId}"]`)!;

  const point = (blockId: BlockId, offset: number): [Node, number] => {
    const element = editable(blockId);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let rest = offset;

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent!.length;

      if (rest <= length) return [node, rest];
      rest -= length;
    }

    return [element, 0];
  };

  const select = (
    from: { blockId: BlockId; offset: number },
    to: { blockId: BlockId; offset: number } = from,
  ) => {
    const [a, ao] = point(from.blockId, from.offset);
    const [b, bo] = point(to.blockId, to.offset);

    act(() => {
      getSelection()!.setBaseAndExtent(a, ao, b, bo);
      document.dispatchEvent(new Event('selectionchange'));
    });
  };

  const caret = (blockId: BlockId, offset: number) => select({ blockId, offset });

  const fire = (event: Event) => {
    act(() => {
      root.dispatchEvent(event);
    });

    return event;
  };

  const input = (inputType: string, data: string | null = null) =>
    fire(new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }));

  const type = (text: string) => {
    for (const char of text) input('insertText', char);
  };

  const key = (
    keyName: string,
    modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
  ) =>
    fire(
      new KeyboardEvent('keydown', {
        key: keyName,
        code: keyName.length === 1 ? `Key${keyName.toUpperCase()}` : keyName,
        ctrlKey: modifiers.ctrl ?? false,
        shiftKey: modifiers.shift ?? false,
        altKey: modifiers.alt ?? false,
        bubbles: true,
        cancelable: true,
      }),
    );

  const clipboard = (
    kind: 'paste' | 'copy' | 'cut',
    data: Record<string, string> = {},
    files: File[] = [],
  ) => {
    const store: Record<string, string> = { ...data };
    const event = new Event(kind, { bubbles: true, cancelable: true });

    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => store[type] ?? '',
        setData: (type: string, value: string) => {
          store[type] = value;
        },
        files,
        types: Object.keys(store),
      },
    });
    fire(event);

    return store;
  };

  const outline = () => {
    const out: string[] = [];
    const walk = (id: BlockId) => {
      const block = editor.document.getBlock(id)!;

      out.push(
        `${block.flavour.replace('block:', '')}:${editor.engine.inline.toPlainText(block.content)}`,
      );
      block.children.forEach(walk);
    };

    editor.document.getBlock(noteId)!.children.forEach(walk);

    return out;
  };

  const blocks = () => editor.document.getBlock(noteId)!.children;

  return {
    ...view,
    editor,
    noteId,
    ids,
    root,
    editable,
    select,
    caret,
    input,
    type,
    key,
    clipboard,
    outline,
    blocks,
  };
}
