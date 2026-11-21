import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { Editor } from '@inkbrick/engine';

import { BlockHandleController } from '../src/block-handle/BlockHandleController';
import type { EditorView } from '../src/editing/EditorView';
import {
  EXTERNAL_DRAG,
  drop,
  droppedImageUrls,
  externalDropTarget,
  leave,
  over,
  type DropContext,
} from '../src/images/externalDrop';
import { insertImageFiles } from '../src/images/insertImages';
import { mountEditor } from './harness';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const isSafe = (url: string) => /^(https:|data:image\/png)/.test(url);

const rect = (top: number, height: number) =>
  ({ left: 10, top, width: 300, height, bottom: top + height, right: 310 }) as DOMRect;

/** Контекст с документом из двух блоков: «a» на 0…40 и «b» на 40…80 (у «b» вложенный блок до 120). */
function context(patch: Partial<DropContext> = {}) {
  const view = { blocks: new BlockHandleController() } as unknown as EditorView;
  const insert = vi.fn(() => true);
  const ctx: DropContext = {
    editor: { store: { getBlock: (id: string) => (id === 'gone' ? undefined : { id }) } } as never,
    view,
    root: document.body,
    images: {},
    readOnly: false,
    geometry: {
      probePoint: (_view, x, y) => (y < 0 ? null : { x, y }),
      blockAtPoint: (_editor, _view, _x, y) => (y < 40 ? 'a' : y < 200 ? 'b-child' : null),
      topLevelBlockId: (_editor, id) => id.replace('-child', ''),
      rowRect: (_view, id) => (id === 'a' ? rect(0, 40) : rect(40, 40)),
      blockElement: (_view, id) =>
        ({ getBoundingClientRect: () => (id === 'a' ? rect(0, 40) : rect(40, 80)) }) as HTMLElement,
    },
    insert,
    isAccepted: (file) => file.type === 'image/png',
    isSafe,
    isExternal: (url) => url.startsWith('https://other.test'),
    caretBlock: () => 'caret',
    ...patch,
  };

  return { ctx, view, insert };
}

const file = (name: string, type = 'image/png') => new File(['x'], name, { type });

describe('the drop target of an outside image', () => {
  it('is before or after the top-level block under the pointer, by the half of its line', () => {
    const { ctx } = context();

    expect(externalDropTarget(ctx, 50, 10)).toEqual({
      targetId: 'a',
      position: 'before',
      indicator: { left: 10, width: 300, top: -1 },
    });
    // «После» — под всем блоком вместе с вложенными (низ блока — 120).
    expect(externalDropTarget(ctx, 50, 70)).toEqual({
      targetId: 'b',
      position: 'after',
      indicator: { left: 10, width: 300, top: 121 },
    });
    expect(externalDropTarget(ctx, 50, 500)).toBeNull();
    expect(externalDropTarget(ctx, 50, -5)).toBeNull();
  });

  it('the insertion line follows the image and goes away when it leaves', () => {
    const { ctx, view } = context();

    over(ctx, 50, 10);
    expect(view.blocks.getState().drag).toMatchObject({
      blockId: EXTERNAL_DRAG,
      targetId: 'a',
      position: 'before',
      indicator: { top: -1 },
    });

    over(ctx, 50, 500);
    expect(view.blocks.getState().drag).toMatchObject({ targetId: null, indicator: null });

    over(ctx, 50, 70);
    expect(leave(ctx)).toEqual({ targetId: 'b', position: 'after' });
    expect(view.blocks.getState().drag).toBeNull();
    expect(leave(ctx)).toBeNull();
  });

  it('a block being moved and the read-only mode are left alone', () => {
    const { ctx, view } = context();

    view.blocks.startDrag('moving');
    over(ctx, 50, 10);
    expect(view.blocks.getState().drag).toMatchObject({ blockId: 'moving', targetId: null });
    expect(leave(ctx)).toBeNull();
    expect(view.blocks.getState().drag?.blockId).toBe('moving');

    const reading = context({ readOnly: true });

    over(reading.ctx, 50, 10);
    expect(reading.view.blocks.getState().drag).toBeNull();
  });
});

describe('dropping an outside image', () => {
  const dropped = (patch: Partial<Parameters<typeof drop>[1]> = {}) => ({
    files: [],
    html: '',
    uriList: '',
    x: 50,
    y: 70,
    ...patch,
  });

  it('files go where the line was; unsupported files are skipped', async () => {
    const { ctx, insert } = context();
    const png = file('a.png');

    over(ctx, 50, 10);
    expect(await drop(ctx, dropped({ files: [file('a.pdf', 'application/pdf'), png] }))).toBe(true);
    expect(insert).toHaveBeenCalledWith(ctx.editor, ctx.view, {}, [png], 'a', 'before');
    expect(ctx.view.blocks.getState().drag).toBeNull();

    // Линии не было: место — по точке, где отпустили; нет и её — у каретки.
    await drop(ctx, dropped({ files: [png] }));
    expect(insert).toHaveBeenLastCalledWith(ctx.editor, ctx.view, {}, [png], 'b', 'after');
    await drop(ctx, dropped({ files: [png], y: 500 }));
    expect(insert).toHaveBeenLastCalledWith(ctx.editor, ctx.view, {}, [png], 'caret', 'after');

    expect(await drop(ctx, dropped({ files: [file('a.pdf', 'application/pdf')] }))).toBe(false);
    expect(await drop(context({ readOnly: true }).ctx, dropped({ files: [png] }))).toBe(false);
    expect(
      await drop(context({ caretBlock: () => undefined }).ctx, dropped({ files: [png], y: 500 })),
    ).toBe(false);
  });

  it('an image from a website is inserted by its address', async () => {
    const { ctx, insert } = context();

    await drop(
      ctx,
      dropped({
        html: '<a href="x"><img src="https://site.test/cat.png" alt="cat"><img src="javascript:1"></a>',
        uriList: 'https://site.test/page',
      }),
    );
    expect(insert).toHaveBeenLastCalledWith(
      ctx.editor,
      ctx.view,
      {},
      [{ src: 'https://site.test/cat.png' }],
      'b',
      'after',
    );

    // Без HTML — ссылка, похожая на картинку; страница — не картинка.
    expect(await drop(ctx, dropped({ uriList: '# comment\nhttps://site.test/page' }))).toBe(false);
    await drop(ctx, dropped({ uriList: 'https://site.test/dog.webp?w=1\n' }));
    expect(insert).toHaveBeenLastCalledWith(
      ctx.editor,
      ctx.view,
      {},
      [{ src: 'https://site.test/dog.webp?w=1' }],
      'b',
      'after',
    );
  });

  it('addresses of other servers go through images.rehost; rejected ones are skipped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rehost = vi.fn(async (url: string) => {
      if (url.includes('fail')) throw new Error('offline');

      return url.includes('no') ? null : 'https://own.test/copy.png';
    });
    const { ctx, insert } = context({ images: { rehost } });

    await drop(
      ctx,
      dropped({
        html:
          '<img src="https://other.test/a.png"><img src="https://other.test/no.png">' +
          '<img src="https://other.test/fail.png"><img src="https://site.test/mine.png">',
      }),
    );
    expect(insert).toHaveBeenLastCalledWith(
      ctx.editor,
      ctx.view,
      { rehost },
      [{ src: 'https://own.test/copy.png' }, { src: 'https://site.test/mine.png' }],
      'b',
      'after',
    );
    expect(warn).toHaveBeenCalledTimes(1);

    // Блок, у которого стояла линия, удалили, пока ждали ответа: не вставляем.
    expect(
      await drop(
        context({ images: { rehost }, caretBlock: () => 'gone' }).ctx,
        dropped({ html: '<img src="https://other.test/a.png">', y: 500 }),
      ),
    ).toBe(false);
    warn.mockRestore();
  });

  it('reads the addresses: unique, safe, data: images too', () => {
    expect(
      droppedImageUrls(
        { html: `<img src=" ${PNG} "><img src="${PNG}"><img src="http://x/a.png">`, uriList: '' },
        isSafe,
      ),
    ).toEqual([PNG]);
    expect(
      droppedImageUrls({ html: '', uriList: `${PNG}\r\nhttps://a.test/b.JPG` }, isSafe),
    ).toEqual([PNG, 'https://a.test/b.JPG']);
  });
});

describe('insertImageFiles before a block', () => {
  function setup() {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'one' },
    });

    const view = { placeCaret: vi.fn(), uploads: { start: vi.fn(), finish: vi.fn() } };
    const order = () =>
      editor.document
        .getBlock(note)!
        .children.map((id) => editor.document.getBlock(id)!)
        .map((block) =>
          block.flavour === 'block:image' ? `img:${block.props.src}` : block.flavour,
        );

    return { editor, view: view as unknown as EditorView, first, order };
  }

  it('the first block: the image becomes the first child of the note', () => {
    const { editor, view, first, order } = setup();

    expect(insertImageFiles(editor, view, {}, [{ src: PNG }], first, 'before')).toBe(true);
    expect(order()).toEqual([`img:${PNG}`, 'block:paragraph']);
  });

  it('another block: after its previous neighbour, in order', () => {
    const { editor, view, first, order } = setup();
    const second = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: first },
      }) as { blockId: string }
    ).blockId;

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: second, from: 0, to: 0, text: 'two' },
    });
    insertImageFiles(
      editor,
      view,
      {},
      [{ src: PNG }, { src: 'https://a.test/b.png' }],
      second,
      'before',
    );

    expect(order()).toEqual([
      'block:paragraph',
      `img:${PNG}`,
      'img:https://a.test/b.png',
      'block:paragraph',
    ]);
  });
});

describe('the editor wires the outside drag', () => {
  afterEach(cleanup);

  /** Событие перетаскивания с данными: в jsdom нет DataTransfer и DragEvent. */
  function dragEvent(type: string, data: Record<string, string>, files: File[] = []) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const types = [...Object.keys(data), ...(files.length > 0 ? ['Files'] : [])];

    Object.assign(event, {
      clientX: 50,
      clientY: 5,
      dataTransfer: { types, files, dropEffect: 'none', getData: (key: string) => data[key] ?? '' },
    });

    return event as DragEvent;
  }

  it('drag over shows the line (after its chunk loads), drop inserts the image there', async () => {
    const { editor, ids, root } = mountEditor(['one', 'two']);
    const second = root.querySelector<HTMLElement>(`[data-block-id="${ids[1]}"]`)!;

    root.getBoundingClientRect = () => rect(0, 400);
    for (const element of [second, ...second.querySelectorAll<HTMLElement>('*')]) {
      element.getBoundingClientRect = () => rect(0, 20);
    }
    document.elementFromPoint = () => second;

    const first = dragEvent('dragover', { 'text/uri-list': 'https://a.test/x.png' });

    root.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(first.dataTransfer!.dropEffect).toBe('copy');

    await vi.dynamicImportSettled();
    act(() => {
      root.dispatchEvent(dragEvent('dragover', { 'text/uri-list': 'https://a.test/x.png' }));
    });

    expect(document.querySelector('[data-testid="drop-indicator"]')).not.toBeNull();

    // Ушли с документа — линии нет; вернулись и отпустили — картинка перед вторым блоком.
    act(() => {
      root.dispatchEvent(dragEvent('dragleave', {}));
    });
    act(() => {
      root.dispatchEvent(dragEvent('dragover', { 'text/uri-list': 'https://a.test/x.png' }));
    });
    await act(async () => {
      root.dispatchEvent(
        dragEvent('drop', { 'text/uri-list': 'https://a.test/x.png', 'text/html': '' }),
      );
      await vi.dynamicImportSettled();
    });

    await vi.waitFor(() => {
      const note = editor.document.getBlock(editor.document.rootId)!.children[0];

      expect(
        editor.document.getBlock(note)!.children.map((id) => editor.document.getBlock(id)!.flavour),
      ).toEqual(['block:paragraph', 'block:image', 'block:paragraph']);
    });
    expect(document.querySelector('[data-testid="drop-indicator"]')).toBeNull();

    // Простой текст с другого сайта линию не показывает и не перехватывается.
    const text = dragEvent('dragover', { 'text/plain': 'hello' });

    root.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
  });
});
