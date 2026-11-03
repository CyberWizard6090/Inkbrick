import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { Editor } from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  useEditorUI,
  useDocument,
  useEditorView,
  useHistory,
  type EditorView,
} from '../src';
import { addBlockBelow, buildBlockActions } from '../src/block-handle/actions';
import { mountEditor } from './harness';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Выделению нужна ненулевая геометрия: иначе toolbar считает, что показывать нечего.
const original = Range.prototype.getBoundingClientRect;

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 60, 18);
});

afterEach(() => {
  Range.prototype.getBoundingClientRect = original;
  cleanup();
});

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);

describe('slash menu', () => {
  it('opens on "/", filters, moves with arrows and applies with Enter', () => {
    const { ids, root, caret, type, key, outline } = mountEditor(['']);

    caret(ids[0], 0);
    type('/');

    const menu = $('[data-testid="slash-menu"]')!;

    expect(menu).not.toBeNull();
    expect(root.getAttribute('aria-controls')).toBe(menu.id);
    expect(root.getAttribute('aria-activedescendant')).toBeTruthy();

    type('head');
    const titles = [...menu.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t) => /heading/i.test(t ?? ''))).toBe(true);

    key('ArrowDown');
    key('ArrowUp');
    key('Enter');

    expect(outline()[0]).toMatch(/^heading:$/);
    expect($('[data-testid="slash-menu"]')).toBeNull();
    expect(root.hasAttribute('aria-controls')).toBe(false);
  });

  it('Escape closes the menu and keeps the text; a click on an item applies it', () => {
    const { ids, caret, type, key, outline } = mountEditor(['']);

    caret(ids[0], 0);
    type('/');
    key('Escape');
    expect($('[data-testid="slash-menu"]')).toBeNull();
    expect(outline()).toEqual(['paragraph:/']);

    caret(ids[0], 1);
    type(' /quote');
    fireEvent.click($('[data-testid="slash-menu"] [role="option"]')!);
    expect(outline()[0]).toMatch(/^quote:/);
  });

  it('a query without matches followed by a space is just text', () => {
    const { ids, caret, type, outline } = mountEditor(['']);

    caret(ids[0], 0);
    type('/zzz ');

    expect($('[data-testid="slash-menu"]')).toBeNull();
    expect(outline()).toEqual(['paragraph:/zzz ']);
  });
});

describe('formatting toolbar', () => {
  const toolbar = () => $('[data-testid="toolbar"]')!;
  const button = (format: string) =>
    toolbar().querySelector<HTMLElement>(`[data-format="${format}"]`)!;

  it('appears over a selection and applies formats, colors and alignment', () => {
    const { editor, ids, select } = mountEditor(['format me']);
    const block = () => editor.document.getBlock(ids[0])!;

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 6 });
    expect(toolbar()).not.toBeNull();

    fireEvent.click(button('bold'));
    fireEvent.click(button('italic'));
    expect(block().content[0]).toEqual({
      insert: 'format',
      attributes: { bold: true, italic: true },
    });
    expect(button('bold').hasAttribute('data-pressed')).toBe(true);

    fireEvent.click(button('color'));
    fireEvent.click(toolbar().querySelector('[data-kind="color"] [data-color="red"]')!);
    expect(block().content[0].attributes).toMatchObject({ color: 'red' });

    fireEvent.click(button('highlight'));
    fireEvent.click(toolbar().querySelector('[data-kind="highlight"] [data-color="yellow"]')!);
    expect(block().content[0].attributes).toMatchObject({ backgroundColor: 'yellow' });

    fireEvent.click(button('color'));
    fireEvent.click(toolbar().querySelector('[data-kind="color"] [data-color=""]')!);
    expect(block().content[0].attributes).not.toHaveProperty('color');

    fireEvent.click(button('align-center'));
    expect(block().props).toMatchObject({ alignment: 'center' });
  });

  it('link: the form validates the address; a safe one is applied, Escape cancels', () => {
    const { editor, ids, select } = mountEditor(['see docs']);

    select({ blockId: ids[0], offset: 4 }, { blockId: ids[0], offset: 8 });
    fireEvent.click(button('link'));

    const input = toolbar().querySelector<HTMLInputElement>('[data-inkbrick-part="input"]')!;
    const form = toolbar().querySelector('form')!;

    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(form);
    expect(input.getAttribute('data-invalid')).not.toBeNull();

    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(form);
    expect(editor.document.getBlock(ids[0])!.content[1]).toEqual({
      insert: 'docs',
      attributes: { link: 'https://example.com' },
    });
  });

  it('the formula button turns the selection into the code of an inline formula', () => {
    const { editor, ids, select } = mountEditor(['x+1']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 3 });
    fireEvent.click(button('formula'));

    const source = $<HTMLTextAreaElement>(
      '[data-testid="formula-popover"] [data-inkbrick-part="formula-source"]',
    )!;
    expect(source.value).toBe('x+1');

    fireEvent.click($('[data-testid="formula-popover"] [data-action="apply"]')!);
    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: '￼', attributes: { formula: 'x+1' } },
    ]);
  });
});

describe('inline formula popover', () => {
  it('Ctrl+Shift+M inserts, a click edits, Remove deletes, Escape cancels', () => {
    const { editor, ids, caret, key } = mountEditor(['a ']);
    const content = () => editor.document.getBlock(ids[0])!.content;
    const popover = () => $('[data-testid="formula-popover"]');
    const source = () =>
      popover()!.querySelector<HTMLTextAreaElement>('[data-inkbrick-part="formula-source"]')!;

    caret(ids[0], 2);
    key('M', { ctrl: true, shift: true });
    fireEvent.change(source(), { target: { value: 'E=mc^2' } });
    fireEvent.keyDown(source(), { key: 'Enter' });
    expect(content()[1]).toEqual({ insert: '￼', attributes: { formula: 'E=mc^2' } });

    fireEvent.click($('[data-inkbrick-formula]')!);
    expect(source().value).toBe('E=mc^2');
    fireEvent.change(source(), { target: { value: 'nothing' } });
    fireEvent.keyDown(source(), { key: 'Escape' });
    expect(popover()).toBeNull();
    expect(content()[1].attributes).toEqual({ formula: 'E=mc^2' });

    fireEvent.click($('[data-inkbrick-formula]')!);
    fireEvent.click(popover()!.querySelector('[data-action="remove"]')!);
    expect(content()).toEqual([{ insert: 'a ' }]);
  });
});

describe('images', () => {
  const file = (name = 'shot.png') =>
    new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

  it('a pasted image file is uploaded into a new image block', async () => {
    const upload = vi.fn(async () => PNG);
    const { editor, ids, caret, clipboard } = mountEditor(['text'], { images: { upload } });

    caret(ids[0], 4);
    clipboard('paste', {}, [file()]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const image = Object.values(editor.document.dump()).find((b) => b.flavour === 'block:image')!;

    expect(upload).toHaveBeenCalledTimes(1);
    expect(image.props).toMatchObject({ src: PNG, alt: 'shot' });
  });

  it('a failed upload removes the empty block and reports the error', async () => {
    const onError = vi.fn();
    const { editor, ids, caret, clipboard } = mountEditor([''], {
      images: { upload: async () => Promise.reject(new Error('no network')), onError },
    });

    caret(ids[0], 0);
    clipboard('paste', {}, [file()]);
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(Object.values(editor.document.dump()).some((b) => b.flavour === 'block:image')).toBe(
      false,
    );
  });

  it('the picker embeds a safe link, rejects an unsafe one; caption, alt, width and alignment are edited in place', () => {
    const { editor, ids, caret, key, type } = mountEditor(['']);
    const image = () =>
      Object.values(editor.document.dump()).find((b) => b.flavour === 'block:image')!;

    caret(ids[0], 0);
    type('/image');
    key('Enter');

    const input = $<HTMLInputElement>('[data-inkbrick-part="picker-input"]')!;

    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect($('[data-inkbrick-part="picker-error"]')).not.toBeNull();
    expect(image().props.src).toBe('');

    fireEvent.change(input, { target: { value: 'example.com/cat.png' } });
    fireEvent.click($('[data-inkbrick-part="picker-button"]')!);
    expect(image().props.src).toBe('https://example.com/cat.png');

    const caption = $<HTMLInputElement>('[data-inkbrick-part="caption"]')!;
    fireEvent.change(caption, { target: { value: 'A cat' } });
    fireEvent.keyDown(caption, { key: 'Enter' });
    expect(image().props.caption).toBe('A cat');

    const alt = $<HTMLInputElement>('[data-inkbrick-part="alt"]')!;
    fireEvent.change(alt, { target: { value: 'typed' } });
    fireEvent.keyDown(alt, { key: 'Escape' });
    expect(image().props.alt).not.toBe('typed');

    fireEvent.click($('[data-inkbrick-part="width"]')!);
    fireEvent.click($('[data-inkbrick-ui="select"] [data-value="50"]')!);
    expect(image().props.width).toBe(50);

    const right = [...document.querySelectorAll<HTMLElement>('[data-inkbrick-part="tool"]')].find(
      (b) => b.getAttribute('data-align') === 'right',
    );
    if (right) {
      fireEvent.click(right);
      expect(image().props.align).toBe('right');
    }
  });
});

describe('block menu actions and history', () => {
  function setup() {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];
    const second = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: first },
      }) as {
        blockId: string;
      }
    ).blockId;

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'one' },
    });
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: second, from: 0, to: 0, text: 'two' },
    });

    let view!: EditorView;
    let ui!: ReturnType<typeof useEditorUI>;
    let history!: ReturnType<typeof useHistory>;

    function Probe() {
      view = useEditorView();
      ui = useEditorUI();
      history = useHistory();

      return null;
    }

    render(
      <EditorProvider editor={editor} formulaRenderer={false}>
        <DocumentView />
        <Probe />
      </EditorProvider>,
    );

    const texts = () =>
      editor.document
        .getBlock(note)!
        .children.map((id) =>
          editor.engine.inline.toPlainText(editor.document.getBlock(id)!.content),
        );
    const actions = (blockId: string) =>
      buildBlockActions(editor, view, blockId, ui.slashItems, ui.t);

    return {
      editor,
      note,
      first,
      second,
      texts,
      actions,
      history: () => history,
      view: () => view,
    };
  }

  it('duplicate, move down/up, turn into, delete', () => {
    const { first, texts, actions, editor, note } = setup();
    const run = (blockId: string, id: string, list: 'actions' | 'turnInto' = 'actions') =>
      act(() => {
        const items = actions(blockId)[list];

        items.find((a) => a.id === id)!.run();
      });

    run(first, 'duplicate');
    expect(texts()).toEqual(['one', 'one', 'two']);

    run(first, 'move-down');
    expect(texts()).toEqual(['one', 'one', 'two']);
    expect(editor.document.getBlock(note)!.children.indexOf(first)).toBe(1);

    run(first, 'move-up');
    expect(editor.document.getBlock(note)!.children.indexOf(first)).toBe(0);

    expect(actions(first).actions.find((a) => a.id === 'move-up')!.disabled).toBe(true);

    const heading = actions(first).turnInto.find((a) => /heading/.test(a.id))!;
    act(() => heading.run());
    expect(editor.document.getBlock(first)!.flavour).toBe('block:heading');

    run(first, 'delete');
    expect(texts()).toEqual(['one', 'two']);
  });

  it('"+" adds a block below and opens the slash menu', () => {
    const { first, texts, editor, view } = setup();

    act(() => addBlockBelow(editor, view(), first, []));

    expect(texts()).toEqual(['one', '/', 'two']);
    expect(view().slash.getState().open).toBe(true);
  });

  it('useHistory reports and runs undo/redo', () => {
    const { history, texts, editor, first } = setup();

    editor.clearHistory();
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: first, from: 3, to: 3, text: '!' },
      });
    });

    expect(history().canUndo).toBe(true);
    act(() => {
      expect(history().undo()).toBe(true);
    });
    expect(texts()).toEqual(['one', 'two']);
    act(() => {
      expect(history().redo()).toBe(true);
    });
    expect(texts()).toEqual(['one!', 'two']);
  });
});

describe('useDocument', () => {
  it('re-renders on every document change', () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];
    let renders = 0;

    function Count() {
      const document = useDocument();

      renders++;

      return (
        <output>
          {document
            .getBlock(first)!
            .content.map((n) => n.insert)
            .join('')}
        </output>
      );
    }

    const { container } = render(
      <EditorProvider editor={editor}>
        <Count />
      </EditorProvider>,
    );
    const before = renders;

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: first, from: 0, to: 0, text: 'hi' },
      });
    });

    expect(renders).toBeGreaterThan(before);
    expect(container.querySelector('output')!.textContent).toBe('hi');
  });
});
