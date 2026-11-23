import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';

import {
  cropDialog,
  openCropper,
  openViewer,
  stepZoom,
  type CropResult,
  type CropperHandle,
  type CropperOptions,
  type ViewerHandle,
  type ViewerImage,
  type ViewerOptions,
} from '../../src/image-tools';

/** Открытые в тесте окна: после каждого теста закрываются, как размонтирование компонента. */
const opened: Array<CropperHandle | ViewerHandle> = [];

/** Закрывает окна (как размонтирование компонента); страница остаётся. */
function cleanup() {
  for (const handle of opened.splice(0)) handle.close();
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

/** jsdom не меряет элементы и не грузит картинки: размеры и загрузку задаём сами. */
function sizeStage(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { width, height, top: 0, left: 0, right: width, bottom: height } as DOMRect;
  });
}

function loadPicture(selector: string, width: number, height: number) {
  const image = $<HTMLImageElement>(selector);

  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(image);
}

describe('openCropper', () => {
  afterEach(() => vi.restoreAllMocks());

  function open(props: Partial<CropperOptions> & { busy?: boolean } = {}) {
    const onSave = vi.fn<(result: CropResult) => void>();
    const onCancel = vi.fn();
    const outside = document.createElement('button');

    document.body.append(outside);
    outside.focus();
    sizeStage(400, 200);
    const { busy, ...rest } = props;
    const handle = openCropper({ src: 'https://a.test/p.png', onSave, onCancel, ...rest });

    opened.push(handle);
    if (busy) handle.setBusy(true);
    loadPicture('[data-inkbrick-part="cropper-image"]', 800, 400);

    return { onSave, onCancel, outside, box: $('[data-inkbrick-part="cropper-box"]') };
  }

  it('opens over the page as a modal dialog, fits the picture and focuses the frame', () => {
    const { box } = open();
    const dialog = $('[data-testid="image-cropper"]');

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(box);
    expect(document.documentElement.style.overflow).toBe('hidden');

    const canvas = $('[data-inkbrick-part="cropper-canvas"]');

    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('200px');
    expect(canvas.hasAttribute('data-ready')).toBe(true);
    expect(box.style.width).toBe('100%');
  });

  it('dragging the frame moves it, a handle resizes it; Save returns the frame', () => {
    const { box, onSave } = open();
    const se = $('[data-handle="se"]');

    fireEvent.pointerDown(se, { button: 0, pointerId: 1, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(se, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(se, { pointerId: 1 });
    expect(box.style.width).toBe('50%');
    expect(box.style.height).toBe('50%');

    fireEvent.pointerDown(box, { button: 0, pointerId: 2, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(box, { pointerId: 2, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(box, { pointerId: 2 });
    expect(box.style.left).toBe('25%');
    expect(box.style.top).toBe('50%');

    // Правая кнопка мыши рамку не трогает.
    fireEvent.pointerDown(box, { button: 2, pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(box, { pointerId: 3, clientX: 400, clientY: 400 });
    expect(box.style.left).toBe('25%');

    fireEvent.click($('[data-inkbrick-part="cropper-save"]'));
    expect(onSave).toHaveBeenCalledWith({
      rect: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 },
      aspect: 'free',
      natural: { width: 800, height: 400 },
    });
  });

  it('keys: arrows move, Shift with arrows resizes, Enter saves', () => {
    const { box, onSave } = open({ initialRect: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } });

    fireEvent.keyDown(box, { key: 'ArrowRight' });
    fireEvent.keyDown(box, { key: 'ArrowDown', ctrlKey: true });
    fireEvent.keyDown(box, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(box, { key: 'Enter' });

    const { rect } = onSave.mock.calls[0][0];

    expect(rect.x).toBeCloseTo(0.21);
    expect(rect.y).toBeCloseTo(0.3);
    expect(rect.width).toBeCloseTo(0.49);
    expect(rect.height).toBeCloseTo(0.5);
  });

  it('the shape menu picks a circle, a ratio and its orientation, the frame takes the ratio', () => {
    const { box, onSave } = open();
    const trigger = $('[data-inkbrick-part="cropper-shape-button"]');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const menu = $('[data-inkbrick-part="cropper-menu"]');

    expect(menu.getAttribute('role')).toBe('menu');
    // Картинка альбомная: пропорции в меню — альбомные.
    expect($('[data-inkbrick-part="cropper-shape"][data-aspect="16:9"]')).not.toBeNull();

    fireEvent.click($('[data-inkbrick-part="cropper-shape"][data-aspect="circle"]'));
    expect(box.dataset.shape).toBe('circle');
    // Круг на картинке 2:1: квадрат по высоте, в центре.
    expect(box.style.width).toBe('50%');
    expect(box.style.left).toBe('25%');
    expect($('[data-inkbrick-part="cropper-menu"]')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click($('[data-inkbrick-part="cropper-orientation"][data-aspect="3:4"]'));
    fireEvent.click(trigger);
    expect(
      $('[data-inkbrick-part="cropper-orientation"][data-aspect="3:4"]').getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
    // Ориентация запоминается: остальные пропорции теперь книжные.
    expect($('[data-inkbrick-part="cropper-shape"][data-aspect="9:16"]')).not.toBeNull();

    fireEvent.keyDown(menu.isConnected ? menu : $('[data-inkbrick-part="cropper-menu"]'), {
      key: 'Escape',
    });
    expect($('[data-inkbrick-part="cropper-menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click($('[data-inkbrick-part="cropper-save"]'));
    expect(onSave.mock.calls[0][0].aspect).toBe('3:4');
    expect(onSave.mock.calls[0][0].rect.height).toBe(1);
  });

  it('the menu: arrows walk the items, Home and End jump, a press outside closes it', async () => {
    open();

    const trigger = $('[data-inkbrick-part="cropper-shape-button"]');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const menu = $('[data-inkbrick-part="cropper-menu"]');
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];

    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items.at(-1));

    fireEvent.pointerDown($('[data-inkbrick-part="cropper-stage"]'));
    expect($('[data-inkbrick-part="cropper-menu"]')).toBeNull();
  });

  it('Escape and Cancel cancel; the focus goes back; a shape given at open fits the frame', () => {
    const { onCancel, outside } = open({ initialAspect: '1:1', labels: { cancel: 'Отмена' } });

    expect($('[data-inkbrick-part="cropper-box"]').style.width).toBe('50%');
    fireEvent.keyDown($('[data-testid="image-cropper"]'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click($('[data-inkbrick-part="cropper-cancel"]'));
    expect($('[data-inkbrick-part="cropper-cancel"]').textContent).toBe('Отмена');
    expect(onCancel).toHaveBeenCalledTimes(2);

    cleanup();
    expect(document.activeElement).toBe(outside);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('a picture that does not load closes the window (or calls onError)', () => {
    const { onCancel } = open();

    fireEvent.error($('[data-inkbrick-part="cropper-image"]'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    cleanup();

    const onError = vi.fn();

    opened.push(openCropper({ src: 'x.png', onSave: () => undefined, onCancel, onError }));
    fireEvent.error($('[data-inkbrick-part="cropper-image"]'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Окно закрыли раньше, чем картинка ответила: владельца больше не зовут.
    const late = vi.fn();
    const handle = openCropper({ src: 'y.png', onSave: () => undefined, onCancel: late });
    const image = $<HTMLImageElement>('[data-inkbrick-part="cropper-image"][src="y.png"]');

    handle.close();
    fireEvent.error(image);
    expect(late).not.toHaveBeenCalled();
  });

  it('Escape does not cancel while the crop is being saved', () => {
    const { onCancel } = open({ busy: true });

    fireEvent.keyDown($('[data-testid="image-cropper"]'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('while saving the buttons are locked; Tab stays inside the window', () => {
    const { onSave } = open({ busy: true, theme: 'dark' });
    const save = $<HTMLButtonElement>('[data-inkbrick-part="cropper-save"]');

    expect(save.disabled).toBe(true);
    expect($('[data-testid="image-cropper"]').dataset.inkbrickTheme).toBe('dark');
    fireEvent.keyDown($('[data-inkbrick-part="cropper-box"]'), { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();

    cleanup();
    open();

    const dialog = $('[data-testid="image-cropper"]');
    const trigger = $('[data-inkbrick-part="cropper-shape-button"]');
    const box = $('[data-inkbrick-part="cropper-box"]');

    box.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(box);
  });
});

describe('openViewer', () => {
  afterEach(() => vi.restoreAllMocks());

  const images: ViewerImage[] = [
    { src: 'https://a.test/1.png', alt: 'one' },
    { src: 'https://a.test/2.png', alt: 'two', name: 'second.png' },
  ];

  function viewer(props: Partial<ViewerOptions> = {}) {
    const handle = openViewer({ images, onClose: () => undefined, ...props });

    opened.push(handle);

    return handle;
  }

  const picture = () => $<HTMLImageElement>('[data-inkbrick-part="viewer-image"]');
  const zoom = () => $('[data-inkbrick-part="viewer-zoom"]').textContent;

  it('walks the pictures with the buttons and the arrow keys', () => {
    viewer();

    const dialog = $('[data-testid="image-viewer"]');

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(picture().alt).toBe('one');
    expect($<HTMLButtonElement>('[data-inkbrick-part="viewer-previous"]').disabled).toBe(true);

    fireEvent.click($('[data-inkbrick-part="viewer-next"]'));
    expect(picture().alt).toBe('two');
    expect($<HTMLButtonElement>('[data-inkbrick-part="viewer-next"]').disabled).toBe(true);

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(picture().alt).toBe('one');
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(picture().alt).toBe('one');
  });

  it('a focused button that becomes disabled hands the focus to the window, so Escape still closes it', () => {
    const onClose = vi.fn();

    viewer({ onClose });

    const dialog = $('[data-testid="image-viewer"]');
    const next = $<HTMLButtonElement>('[data-inkbrick-part="viewer-next"]');
    const zoomIn = $<HTMLButtonElement>('[data-inkbrick-part="viewer-zoom-in"]');

    next.focus();
    fireEvent.click(next);
    expect(next.disabled).toBe(true);
    expect(document.activeElement).toBe(dialog);

    zoomIn.focus();
    for (let i = 0; i < 6; i++) fireEvent.click(zoomIn);
    expect(zoomIn.disabled).toBe(true);
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('zooms by steps, with the wheel and a double click; 0 and the level button fit it back', () => {
    sizeStage(800, 600);
    viewer();
    loadPicture('[data-inkbrick-part="viewer-image"]', 1600, 1200);

    const dialog = $('[data-testid="image-viewer"]');

    expect(zoom()).toBe('100%');
    fireEvent.click($('[data-inkbrick-part="viewer-zoom-in"]'));
    expect(zoom()).toBe('150%');
    fireEvent.keyDown(dialog, { key: '+' });
    expect(zoom()).toBe('200%');
    fireEvent.keyDown(dialog, { key: '-' });
    expect(zoom()).toBe('150%');
    fireEvent.keyDown(dialog, { key: '0' });
    expect(zoom()).toBe('100%');

    fireEvent.click($('[data-inkbrick-part="viewer-zoom-out"]'));
    fireEvent.click($('[data-inkbrick-part="viewer-zoom-out"]'));
    expect(zoom()).toBe('50%');
    expect($<HTMLButtonElement>('[data-inkbrick-part="viewer-zoom-out"]').disabled).toBe(true);

    fireEvent.click($('[data-inkbrick-part="viewer-zoom"]'));
    expect(zoom()).toBe('100%');

    // Колесо (и щипок тачпада — колесо с Ctrl) не масштабирует страницу под окном.
    expect(
      fireEvent.wheel($('[data-inkbrick-part="viewer-stage"]'), { deltaY: -200, ctrlKey: true }),
    ).toBe(false);
    expect(zoom()).toBe('135%');

    fireEvent.doubleClick(picture());
    expect(zoom()).toBe('100%');
    fireEvent.doubleClick(picture());
    expect(zoom()).toBe('200%');

    // Увеличенную картинку двигают, но не дальше её края.
    const stage = $('[data-inkbrick-part="viewer-stage"]');

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 5000, clientY: 50 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    expect(picture().style.transform).toBe('translate(400px, 50px) scale(2)');

    // Щипок двумя пальцами.
    fireEvent.pointerDown(stage, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerDown(stage, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
    });
    fireEvent.pointerMove(stage, { pointerId: 3, clientX: 300, clientY: 100 });
    expect(zoom()).toBe('400%');
  });

  it('downloads through the callback or saves the picture itself', async () => {
    const onDownload = vi.fn();

    viewer({ onDownload });
    fireEvent.click($('[data-inkbrick-part="viewer-next"]'));
    fireEvent.click($('[data-inkbrick-part="viewer-download"]'));
    expect(onDownload).toHaveBeenCalledWith(images[1]);

    cleanup();

    const fetch = vi.fn(async () => Promise.reject(new TypeError('CORS')));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    vi.stubGlobal('fetch', fetch);
    viewer();
    fireEvent.click($('[data-inkbrick-part="viewer-download"]'));
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('https://a.test/1.png', expect.anything());
    vi.unstubAllGlobals();
  });

  it('closes itself with the button, Escape and a click beside the picture (not after a drag)', () => {
    const onClose = vi.fn();
    const isOpen = () => document.querySelector('[data-testid="image-viewer"]') !== null;

    viewer({ onClose });
    fireEvent.click($('[data-inkbrick-part="viewer-close"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);

    viewer({ onClose });
    fireEvent.click(picture());
    expect(isOpen()).toBe(true);
    fireEvent.keyDown($('[data-testid="image-viewer"]'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(isOpen()).toBe(false);

    viewer({ onClose });

    let stage = $('[data-inkbrick-part="viewer-stage"]');

    // Конец перетаскивания — не щелчок мимо картинки.
    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 40, clientY: 0 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    fireEvent.click(stage);
    expect(isOpen()).toBe(true);

    fireEvent.pointerDown(stage, {
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerUp(stage, { pointerId: 2 });
    fireEvent.click(stage);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(isOpen()).toBe(false);

    // `close()` убирает окно без `onClose`; `show` переключает картинку снаружи.
    const handle = viewer({ onClose });

    handle.show(1);
    expect(picture().alt).toBe('two');
    stage = $('[data-inkbrick-part="viewer-stage"]');
    handle.close();
    handle.close();
    expect(stage.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('cropDialog resolves with the result or null and closes the window', async () => {
    sizeStage(400, 200);

    const saved = cropDialog({ src: 'https://a.test/p.png' });

    loadPicture('[data-inkbrick-part="cropper-image"]', 800, 400);
    fireEvent.click($('[data-inkbrick-part="cropper-save"]'));
    expect((await saved)?.natural).toEqual({ width: 800, height: 400 });
    expect(document.querySelector('[data-testid="image-cropper"]')).toBeNull();

    const cancelled = cropDialog({ src: 'https://a.test/p.png' });

    fireEvent.click($('[data-inkbrick-part="cropper-cancel"]'));
    expect(await cancelled).toBeNull();
  });

  it('a single picture has no arrows; no picture renders nothing', () => {
    viewer({ images: [images[0]] });
    expect(document.querySelector('[data-inkbrick-part="viewer-next"]')).toBeNull();

    cleanup();
    viewer({ images: [] });
    expect(document.querySelector('[data-testid="image-viewer"]')).toBeNull();
  });

  it('zoom steps', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.2, 1)).toBe(1.5);
    expect(stepZoom(1.2, -1)).toBe(1);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
});
