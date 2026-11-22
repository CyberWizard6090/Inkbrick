import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { IMAGE_ASPECTS } from '@inkbrick/document';
import { CROP_ASPECTS } from '@inkbrick/dom/image-tools';
import { Editor } from '@inkbrick/engine';

import {
  FULL,
  cropOf,
  cropProps,
  isCropped,
  isFullRect,
  originalOf,
  styleCrop,
} from '../src/images/crop';
import { documentImages } from '../src/blocks/ImageDialogs';
import { downloadOriginal, downloadShown, saveCrop } from '../src/images/saveCrop';
import { mountEditor } from './harness';

// Холст в jsdom не работает: обрезку в файл подменяем, остальное из пакета — настоящее.
const tools = vi.hoisted(() => ({
  cropImage: vi.fn(),
  downloadImage: vi.fn(async () => undefined),
  downloadBlob: vi.fn(),
}));

vi.mock('@inkbrick/dom/image-tools', async (original) => ({
  ...(await original<typeof import('@inkbrick/dom/image-tools')>()),
  cropImage: tools.cropImage,
  downloadImage: tools.downloadImage,
  downloadBlob: tools.downloadBlob,
}));

const ORIGINAL = 'https://cdn.test/photo.png';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function editorWithImage(props: Record<string, unknown> = { src: ORIGINAL }) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];
  const { blockId } = editor.dispatch({
    type: 'insertBlock',
    payload: { flavour: 'block:image', afterId: first, props: props as never },
  }) as { blockId: string };

  editor.clearHistory();

  return { editor, blockId, props: () => editor.store.getBlock(blockId)!.props };
}

const HALF = { x: 0.25, y: 0, width: 0.5, height: 1 };

describe('the crop of a block', () => {
  it('the shape list matches the one of @inkbrick/dom/image-tools', () => {
    expect([...IMAGE_ASPECTS]).toEqual([...CROP_ASPECTS]);
  });

  it('reads the props in percent as fractions and replaces wrong values', () => {
    expect(cropOf({})).toEqual({ aspect: 'free', rect: FULL });
    expect(cropOf({ aspect: '4:3', cropX: 10, cropY: 20, cropWidth: 50, cropHeight: 40 })).toEqual({
      aspect: '4:3',
      rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    });
    // Рамка не выходит за картинку, неизвестная форма — свободная.
    expect(cropOf({ aspect: 'diagonal', cropX: 90, cropWidth: 50 })).toEqual({
      aspect: 'free',
      rect: { x: 0.5, y: 0, width: 0.5, height: 1 },
    });
    expect(cropOf({ cropWidth: Number.NaN }).rect.width).toBe(1);
  });

  it('writes percent with two decimals; a circle or a smaller frame counts as cropped', () => {
    expect(cropProps({ x: 1 / 3, y: 0, width: 0.123456, height: 1 }, 'circle')).toEqual({
      aspect: 'circle',
      cropX: 33.33,
      cropY: 0,
      cropWidth: 12.35,
      cropHeight: 100,
    });
    expect(isFullRect(FULL)).toBe(true);
    expect(isCropped({ aspect: 'free', rect: FULL })).toBe(false);
    expect(isCropped({ aspect: 'circle', rect: FULL })).toBe(true);
    expect(isCropped({ aspect: 'free', rect: HALF })).toBe(true);
  });

  it('the original is originalSrc, or src itself when there is no crop file', () => {
    expect(originalOf({ src: 'a', originalSrc: 'b' })).toBe('b');
    expect(originalOf({ src: 'a', originalSrc: '' })).toBe('a');
    expect(originalOf({})).toBe('');
  });

  it('a crop without a file is drawn by a frame of the right ratio around the visible part', () => {
    // Половина ширины картинки 400×100: кадр 200×100 (2:1), картинка вдвое шире кадра и сдвинута на четверть.
    expect(styleCrop(HALF, { width: 400, height: 100 })).toEqual({
      ratio: 2,
      left: -50,
      top: -0,
      width: 200,
      height: 100,
    });
  });
});

describe('saveCrop', () => {
  beforeEach(() => {
    tools.cropImage.mockReset();
    tools.downloadImage.mockClear();
    tools.downloadBlob.mockClear();
  });

  it('makes a file of the crop, stores it inline with the original, in one undo step', async () => {
    const { editor, blockId, props } = editorWithImage();

    tools.cropImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    expect(await saveCrop(editor, {}, blockId, HALF, '3:4')).toBe('file');
    expect(tools.cropImage).toHaveBeenCalledWith(ORIGINAL, HALF, { shape: 'rect' });
    expect(props()).toMatchObject({
      originalSrc: ORIGINAL,
      aspect: '3:4',
      cropX: 25,
      cropWidth: 50,
    });
    expect(String(props().src)).toMatch(/^data:image\/png;base64,/);

    editor.undo();
    expect(props()).toMatchObject({ src: ORIGINAL, originalSrc: '', aspect: 'free' });
  });

  it('uses images.upload; a second crop starts again from the original', async () => {
    const { editor, blockId, props } = editorWithImage();
    const upload = vi.fn(async (file: File) => `https://cdn.test/${file.name}`);

    tools.cropImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    await saveCrop(editor, { upload }, blockId, HALF, 'circle');
    expect(tools.cropImage).toHaveBeenLastCalledWith(ORIGINAL, HALF, { shape: 'circle' });
    expect(upload.mock.calls[0][0].type).toBe('image/png');
    expect(props()).toMatchObject({ src: 'https://cdn.test/photo.png', originalSrc: ORIGINAL });

    await saveCrop(editor, { upload }, blockId, { x: 0, y: 0, width: 0.5, height: 0.5 }, 'free');
    expect(tools.cropImage).toHaveBeenLastCalledWith(
      ORIGINAL,
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { shape: 'rect' },
    );
  });

  it('keeps the crop as a style when no file can be made (no CORS, upload error)', async () => {
    const { editor, blockId, props } = editorWithImage();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    tools.cropImage.mockRejectedValue(new DOMException('Tainted canvas', 'SecurityError'));

    expect(await saveCrop(editor, {}, blockId, HALF, 'free')).toBe('style');
    expect(props()).toMatchObject({ src: ORIGINAL, originalSrc: '', cropX: 25, cropWidth: 50 });

    tools.cropImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    expect(
      await saveCrop(
        editor,
        { upload: async () => Promise.reject(new Error('offline')) },
        blockId,
        HALF,
        '1:1',
      ),
    ).toBe('style');
    expect(props()).toMatchObject({ src: ORIGINAL, aspect: '1:1' });
    warn.mockRestore();
  });

  it('the whole picture resets the crop back to the original without making a file', async () => {
    const { editor, blockId, props } = editorWithImage({
      src: 'https://cdn.test/crop.png',
      originalSrc: ORIGINAL,
      aspect: '4:3',
      cropWidth: 50,
    });

    expect(await saveCrop(editor, {}, blockId, FULL, 'free')).toBe('reset');
    expect(tools.cropImage).not.toHaveBeenCalled();
    expect(props()).toMatchObject({ src: ORIGINAL, originalSrc: '', cropWidth: 100 });
  });

  it('a picture replaced (or a block deleted) while the file was being made is left alone', async () => {
    const { editor, blockId, props } = editorWithImage();
    let finish!: (blob: Blob) => void;

    tools.cropImage.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));

    const saving = saveCrop(editor, {}, blockId, HALF, 'free');

    await vi.waitFor(() => expect(tools.cropImage).toHaveBeenCalled());
    editor.dispatch({ type: 'setBlockProps', payload: { blockId, props: { src: PNG } } });
    finish(new Blob(['png'], { type: 'image/png' }));

    expect(await saving).toBe('gone');
    expect(props()).toMatchObject({ src: PNG, cropWidth: 100 });
    expect(await saveCrop(editor, {}, 'missing', HALF, 'free')).toBe('gone');
  });

  it('downloads the shown picture: the crop file, a crop made from a style, or the original', async () => {
    tools.cropImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    await downloadShown({ src: 'https://cdn.test/crop.png', originalSrc: ORIGINAL });
    expect(tools.downloadImage).toHaveBeenLastCalledWith('https://cdn.test/crop.png');

    await downloadShown({ src: ORIGINAL, originalSrc: '', cropWidth: 50 });
    expect(tools.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'photo.png');

    tools.cropImage.mockRejectedValue(new Error('no CORS'));
    await downloadShown({ src: ORIGINAL, originalSrc: '', cropWidth: 50 });
    expect(tools.downloadImage).toHaveBeenLastCalledWith(ORIGINAL);

    await downloadOriginal({ src: 'https://cdn.test/crop.png', originalSrc: ORIGINAL });
    expect(tools.downloadImage).toHaveBeenLastCalledWith(ORIGINAL);
  });
});

describe('the image block', () => {
  afterEach(cleanup);

  const imageBlock = (editor: Editor) =>
    Object.values(editor.document.dump()).find((b) => b.flavour === 'block:image')!;

  function mountImage(props: Record<string, unknown>) {
    const mounted = mountEditor(['']);
    const { editor, ids } = mounted;

    act(() => {
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:image', afterId: ids[0], props: props as never },
      });
    });

    return { ...mounted, image: () => imageBlock(editor) };
  }

  const $ = <T extends Element = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector);

  it('lists the pictures of the document in order for the viewer', () => {
    const { editor } = editorWithImage({ src: ORIGINAL });
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const last = editor.document.getBlock(note)!.children.at(-1)!;

    editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:image', afterId: last, props: { src: PNG, alt: 'dot' } as never },
    });
    editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:image', afterId: last, props: {} as never },
    });

    expect(documentImages(editor).map(({ src, alt }) => ({ src, alt }))).toEqual([
      { src: ORIGINAL, alt: '' },
      { src: PNG, alt: 'dot' },
    ]);
  });

  it('a crop without a file is shown by a frame; a circle is marked on the figure', () => {
    mountImage({ src: ORIGINAL, aspect: 'circle', cropX: 25, cropWidth: 50 });

    const frame = $('[data-inkbrick-part="frame"]')!;
    const img = frame.querySelector('img')!;

    expect($('[data-inkbrick-part="figure"]')!.dataset.shape).toBe('circle');
    expect(frame.hasAttribute('data-ready')).toBe(false);

    Object.defineProperty(img, 'naturalWidth', { value: 400 });
    Object.defineProperty(img, 'naturalHeight', { value: 100 });
    fireEvent.load(img);

    expect(frame.hasAttribute('data-ready')).toBe(true);
    expect(frame.style.aspectRatio).toMatch(/^2( \/ 1)?$/);
    expect(img.style.left).toBe('-50%');
    expect(img.style.width).toBe('200%');
  });

  it('a crop file is shown as is', () => {
    mountImage({ src: PNG, originalSrc: ORIGINAL, cropX: 25, cropWidth: 50 });

    expect($('[data-inkbrick-part="frame"]')).toBeNull();
    expect($<HTMLImageElement>('[data-inkbrick-part="image"]')!.src).toBe(PNG);
    expect($('[data-tool="crop"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('the side handles change the width with the pointer: once, when released', () => {
    const { editor, image } = mountImage({ src: PNG, width: 50 });
    const block = $('[data-inkbrick-block="image"]')!;

    block.getBoundingClientRect = () => ({ width: 400 }) as DOMRect;

    const end = $('[data-inkbrick-part="resize"][data-side="end"]')!;
    const before = editor.store.getHistoryVersion?.();

    fireEvent.pointerDown(end, { button: 0, pointerId: 1, clientX: 300 });
    // По центру ширина меняется с двух сторон: 20 px вправо — это 40 px, 10 % от 400.
    fireEvent.pointerMove(end, { pointerId: 1, clientX: 320 });
    expect($('[data-inkbrick-part="figure"]')!.style.width).toBe('60%');
    expect(image().props.width).toBe(50);

    fireEvent.pointerMove(end, { pointerId: 1, clientX: 1000 });
    expect($('[data-inkbrick-part="figure"]')!.style.width).toBe('100%');
    fireEvent.pointerUp(end, { pointerId: 1, clientX: 1000 });
    expect(image().props.width).toBe(100);
    expect(before).not.toBe(editor.store.getHistoryVersion?.());

    // Левая ручка у картинки слева: вправо — уже, один к одному.
    act(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: image().id, props: { align: 'left', width: 50 } as never },
      });
    });

    const start = $('[data-inkbrick-part="resize"][data-side="start"]')!;

    fireEvent.pointerDown(start, { button: 0, pointerId: 2, clientX: 0 });
    fireEvent.pointerMove(start, { pointerId: 2, clientX: 40 });
    fireEvent.pointerUp(start, { pointerId: 2, clientX: 40 });
    expect(image().props.width).toBe(40);
  });

  it('«More» resets the crop back to the original', () => {
    const { image } = mountImage({
      src: PNG,
      originalSrc: ORIGINAL,
      aspect: 'circle',
      cropWidth: 50,
    });

    fireEvent.click($('[data-tool="more"]')!);
    fireEvent.click($('[data-action="reset-crop"]')!);

    expect(image().props).toMatchObject({
      src: ORIGINAL,
      originalSrc: '',
      aspect: 'free',
      cropWidth: 100,
    });
    expect($('[data-popover="more"]')).toBeNull();
  });

  it('opens the viewer on the picture and closes it with Escape; downloads go through the tools', async () => {
    mountImage({ src: PNG, originalSrc: ORIGINAL, cropWidth: 50 });

    fireEvent.click($('[data-tool="download"]')!);
    await vi.waitFor(() => expect(tools.downloadImage).toHaveBeenLastCalledWith(PNG));

    fireEvent.click($('[data-tool="more"]')!);
    fireEvent.click($('[data-action="download-original"]')!);
    await vi.waitFor(() => expect(tools.downloadImage).toHaveBeenLastCalledWith(ORIGINAL));

    fireEvent.click($('[data-tool="view"]')!);
    await vi.waitFor(() => expect($('[data-testid="image-viewer"]')).not.toBeNull());
    expect($<HTMLImageElement>('[data-inkbrick-part="viewer-image"]')!.src).toBe(PNG);

    fireEvent.keyDown($('[data-testid="image-viewer"]')!, { key: 'Escape' });
    expect($('[data-testid="image-viewer"]')).toBeNull();
  });

  it('the crop dialog saves through saveCrop and closes', async () => {
    tools.cropImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    const { image } = mountImage({ src: ORIGINAL });

    fireEvent.click($('[data-tool="crop"]')!);
    await vi.waitFor(() => expect($('[data-testid="image-cropper"]')).not.toBeNull());

    const picture = $<HTMLImageElement>('[data-inkbrick-part="cropper-image"]')!;

    Object.defineProperty(picture, 'naturalWidth', { value: 400 });
    Object.defineProperty(picture, 'naturalHeight', { value: 200 });
    fireEvent.load(picture);

    fireEvent.click($('[data-inkbrick-part="cropper-shape-button"]')!);
    fireEvent.click($('[data-inkbrick-part="cropper-shape"][data-aspect="1:1"]')!);
    fireEvent.click($('[data-inkbrick-part="cropper-save"]')!);

    await vi.waitFor(() => expect($('[data-testid="image-cropper"]')).toBeNull());
    expect(image().props).toMatchObject({
      aspect: '1:1',
      originalSrc: ORIGINAL,
      cropX: 25,
      cropWidth: 50,
      cropHeight: 100,
    });
  });
});
