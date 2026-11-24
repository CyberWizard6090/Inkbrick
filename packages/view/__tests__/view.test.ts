import { describe, expect, it, vi } from 'vitest';

import { Editor } from '@inkbrick/engine';

import {
  EditorView,
  readDocSelection,
  renderInline,
  toggleFormatInSelection,
  visibleSlashItems,
  type SlashMenuItem,
} from '../src';

/*
 * Ядро интерфейса без React: редактор на чистом DOM. Блок рисует `renderInline`, выделение читается из DOM и ставится в
 * него, правка идёт через `view.commit` — так же, как в `@inkbrick/react`, только без компонентов.
 */
function plainEditor(text: string) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const blockId = editor.document.getBlock(note)!.children[0];

  editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text } });

  const root = document.createElement('div');
  const element = document.createElement('div');

  root.contentEditable = 'true';
  element.className = 'editable';
  element.dataset.id = blockId;
  root.append(element);
  document.body.replaceChildren(root);

  // «Интерфейс» перерисовывает блок сам, синхронно — `commit` ему не нужен.
  const draw = () => renderInline(element, editor.document.getBlock(blockId)!.content);
  const view = new EditorView();

  editor.store.subscribeChanges(draw);
  draw();
  view.setRoot(root);
  view.register(blockId, element);

  return { editor, view, root, blockId };
}

describe('@inkbrick/view without a framework', () => {
  it('reads and places the selection in plain DOM', () => {
    const { view, root, blockId } = plainEditor('Hello world');

    view.placeSelection({ blockId, offset: 6 }, { blockId, offset: 11 });

    expect(readDocSelection(root)).toMatchObject({
      from: { blockId, offset: 6 },
      to: { blockId, offset: 11 },
      collapsed: false,
    });
  });

  it('formats through view.commit and keeps the selection on the new DOM', () => {
    const { editor, view, root, blockId } = plainEditor('Hello world');
    const commit = vi.spyOn(view, 'commit');
    const selection = {
      from: { blockId, offset: 6 },
      to: { blockId, offset: 11 },
      collapsed: false,
    };

    toggleFormatInSelection(editor, view, selection, 'bold');

    expect(commit).toHaveBeenCalledOnce();
    expect(editor.document.getBlock(blockId)!.content).toEqual([
      { insert: 'Hello ' },
      { insert: 'world', attributes: { bold: true } },
    ]);
    expect(root.querySelector('strong')?.textContent).toBe('world');
    expect(readDocSelection(root)).toMatchObject({ from: { offset: 6 }, to: { offset: 11 } });
  });

  it('lets a wrapper render each edit before the caret is placed', () => {
    const order: string[] = [];
    const view = new EditorView({
      commit: (update) => {
        order.push('start');
        update();
        order.push('rendered');
      },
    });

    view.commit(() => order.push('edit'));

    expect(order).toEqual(['start', 'edit', 'rendered']);
  });

  it('keeps the wrapper item type through the slash menu helpers', () => {
    const { editor, blockId } = plainEditor('');
    const items: (SlashMenuItem & { readonly icon: string })[] = [
      { id: 'h1', title: 'Heading 1', flavour: 'block:heading', icon: 'H1', group: 'basic' },
      { id: 'quote', title: 'Quote', flavour: 'block:quote', icon: '❝', group: 'basic' },
      { id: 'nope', title: 'Unknown', flavour: 'block:missing', icon: '?' },
    ];

    const visible = visibleSlashItems(editor, items, blockId, 'quo');

    expect(visible.map((item) => item.icon)).toEqual(['❝']);
  });
});
