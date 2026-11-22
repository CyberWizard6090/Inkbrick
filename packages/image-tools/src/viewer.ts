import { downloadImage, fileNameFor } from './download';
import { el, iconButton, setDisabled } from './dom';
import { modal, overlayHost, watchSize } from './modal';

/** Надписи окна просмотра (по умолчанию английские). */
export interface ViewerLabels {
  readonly dialog: string;
  readonly previous: string;
  readonly next: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  /** Подпись масштаба: кнопка сбрасывает его. */
  readonly zoomReset: string;
  readonly download: string;
  readonly close: string;
}

export const DEFAULT_VIEWER_LABELS: ViewerLabels = {
  dialog: 'Image viewer',
  previous: 'Previous image',
  next: 'Next image',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Fit to screen',
  download: 'Download',
  close: 'Close',
};

export interface ViewerImage {
  readonly src: string;
  readonly alt?: string;
  /** Имя файла при сохранении (по умолчанию — из адреса). */
  readonly name?: string;
}

export interface ViewerOptions {
  readonly images: readonly ViewerImage[];
  /** Какая картинка открыта сначала. */
  readonly index?: number;
  readonly labels?: Partial<ViewerLabels>;
  readonly container?: Element | null;
  readonly theme?: 'light' | 'dark';
  /** Показана другая картинка (кнопки или стрелки). */
  onIndexChange?(index: number): void;
  /** Окно закрыли (кнопка, Escape, щелчок мимо картинки). Окно убирается само. */
  onClose?(): void;
  /** Своё сохранение (например, файла после обрезки); по умолчанию — `downloadImage`. */
  onDownload?(image: ViewerImage): void;
}

/** Открытое окно просмотра. */
export interface ViewerHandle {
  /** Показывает картинку с номером `index` (в пределах списка). */
  show(index: number): void;
  /** Убирает окно (без `onClose`). Повторный вызов ничего не делает. */
  close(): void;
}

/** Масштабы кнопок «−» и «+»: 1 — картинка вписана в окно. */
export const VIEWER_ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

const MIN_ZOOM = VIEWER_ZOOMS[0];
const MAX_ZOOM = VIEWER_ZOOMS[VIEWER_ZOOMS.length - 1];

/** Следующий масштаб из ряда в сторону `direction` (1 — крупнее, −1 — мельче). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return VIEWER_ZOOMS.find((level) => level > zoom + 1e-6) ?? MAX_ZOOM;

  return [...VIEWER_ZOOMS].reverse().find((level) => level < zoom - 1e-6) ?? MIN_ZOOM;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Открывает просмотр картинки во весь экран: картинка вписана в окно; снизу — «назад» и «вперёд» по списку, масштаб,
 * сохранение и закрытие. Колесо и щипок меняют масштаб, увеличенную картинку двигают мышью или пальцем, двойной щелчок
 * увеличивает вдвое и возвращает обратно. Клавиши: стрелки — соседние картинки, «+» и «−» — масштаб, 0 — вписать,
 * Escape — закрыть. Без фреймворка: подходит для React, Vue и любого другого кода. Пустой список — окна нет.
 */
export function openViewer(options: ViewerOptions): ViewerHandle {
  const labels = { ...DEFAULT_VIEWER_LABELS, ...options.labels };
  const { images } = options;
  let index = clamp(options.index ?? 0, 0, Math.max(0, images.length - 1));
  let zoom = 1;
  let offset = { x: 0, y: 0 };
  let natural: { width: number; height: number } | null = null;
  let area: { width: number; height: number } | null = null;
  let moved = false;
  let closed = false;
  const pointers = new Map<number, { x: number; y: number }>();

  if (images.length === 0) return { show() {}, close() {} };

  const image = el('img', {
    draggable: 'false',
    referrerpolicy: 'no-referrer',
    'data-inkbrick-part': 'viewer-image',
  });
  const stage = el('div', { 'data-inkbrick-part': 'viewer-stage' }, [image]);
  const previous = iconButton('viewer-previous', labels.previous, 'arrow-left');
  const next = iconButton('viewer-next', labels.next, 'arrow-right');
  const zoomOut = iconButton('viewer-zoom-out', labels.zoomOut, 'minus');
  const level = el('button', {
    type: 'button',
    'data-inkbrick-part': 'viewer-zoom',
    title: labels.zoomReset,
  });
  const zoomIn = iconButton('viewer-zoom-in', labels.zoomIn, 'plus');
  const download = iconButton('viewer-download', labels.download, 'download');
  const closeButton = iconButton('viewer-close', labels.close, 'minimize');
  const bar = el(
    'div',
    { 'data-inkbrick-part': 'viewer-bar', role: 'toolbar', 'aria-label': labels.dialog },
    [
      ...(images.length > 1
        ? [el('div', { 'data-inkbrick-part': 'viewer-group' }, [previous, next])]
        : []),
      el('div', { 'data-inkbrick-part': 'viewer-group' }, [zoomOut, level, zoomIn]),
      el('div', { 'data-inkbrick-part': 'viewer-group' }, [download, closeButton]),
    ],
  );
  const dialog = el(
    'div',
    {
      'data-inkbrick-ui': 'image-viewer',
      'data-inkbrick-theme': options.theme,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': labels.dialog,
      tabindex: -1,
      'data-testid': 'image-viewer',
    },
    [stage, bar],
  );

  // Размер вписанной картинки (в px): по нему сдвиг ограничивается так, чтобы картинка не уходила из окна.
  const fitted = () => {
    if (!natural || !area) return { width: 0, height: 0 };

    const scale = Math.min(1, area.width / natural.width, area.height / natural.height);

    return { width: natural.width * scale, height: natural.height * scale };
  };

  const limit = (point: { x: number; y: number }, scale: number) => {
    if (!area) return point;

    const size = fitted();
    const spareX = Math.max(0, (size.width * scale - area.width) / 2);
    const spareY = Math.max(0, (size.height * scale - area.height) / 2);

    return { x: clamp(point.x, -spareX, spareX), y: clamp(point.y, -spareY, spareY) };
  };

  const render = () => {
    const percent = `${Math.round(zoom * 100)}%`;

    image.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;
    stage.toggleAttribute('data-zoomed', zoom > 1);
    setDisabled(previous, index === 0, dialog);
    setDisabled(next, index === images.length - 1, dialog);
    setDisabled(zoomOut, zoom <= MIN_ZOOM + 1e-6, dialog);
    setDisabled(zoomIn, zoom >= MAX_ZOOM - 1e-6, dialog);
    level.textContent = percent;
    level.setAttribute('aria-label', `${labels.zoomReset} (${percent})`);
  };

  const applyZoom = (value: number) => {
    zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    offset = limit(offset, zoom);
    render();
  };

  const fit = () => {
    zoom = 1;
    offset = { x: 0, y: 0 };
    render();
  };

  const show = (value: number) => {
    index = clamp(value, 0, images.length - 1);
    natural = null;
    image.src = images[index].src;
    image.alt = images[index].alt ?? '';
    fit();
  };

  const go = (step: 1 | -1) => {
    const target = index + step;

    if (target < 0 || target >= images.length) return;

    show(target);
    options.onIndexChange?.(target);
  };

  const close = () => {
    if (closed) return;

    closed = true;
    stopWatching();
    releaseModal();
    dialog.remove();
  };

  const dismiss = () => {
    close();
    options.onClose?.();
  };

  image.addEventListener('load', () => {
    if (image.naturalWidth > 0)
      natural = { width: image.naturalWidth, height: image.naturalHeight };
  });
  image.addEventListener('dblclick', () => (zoom > 1 ? fit() : applyZoom(2)));

  previous.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  zoomOut.addEventListener('click', () => applyZoom(stepZoom(zoom, -1)));
  zoomIn.addEventListener('click', () => applyZoom(stepZoom(zoom, 1)));
  level.addEventListener('click', fit);
  closeButton.addEventListener('click', dismiss);
  download.addEventListener('click', () => {
    const current = images[index];

    if (options.onDownload) options.onDownload(current);
    else void downloadImage(current.src, current.name ?? fileNameFor(current.src));
  });

  // Колесо масштабирует картинку, а не страницу: щипок на тачпаде приходит колесом с Ctrl, и без preventDefault браузер
  // увеличил бы всю страницу под окном.
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (event.deltaY !== 0) applyZoom(zoom * Math.exp(-event.deltaY * 0.0015));
    },
    { passive: false },
  );
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = false;
  });
  stage.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);

    if (!last) return;

    const point = { x: event.clientX, y: event.clientY };
    const others = [...pointers.entries()].filter(([id]) => id !== event.pointerId);

    if (Math.hypot(point.x - last.x, point.y - last.y) > 2) moved = true;

    if (others.length > 0) {
      // Щипок: масштаб меняется в отношении расстояний между пальцами.
      const other = others[0][1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(point.x - other.x, point.y - other.y);

      if (before > 4) applyZoom(zoom * (after / before));
    } else if (zoom > 1) {
      offset = limit({ x: offset.x + point.x - last.x, y: offset.y + point.y - last.y }, zoom);
      render();
    }

    pointers.set(event.pointerId, point);
  });

  const release = (event: PointerEvent) => void pointers.delete(event.pointerId);

  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  // Щелчок мимо картинки закрывает окно (но не конец перетаскивания).
  stage.addEventListener('click', (event) => {
    if (event.target === stage && !moved) dismiss();
  });

  dialog.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (target.tagName === 'INPUT') return;

      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      applyZoom(stepZoom(zoom, 1));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      applyZoom(stepZoom(zoom, -1));
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    }
  });

  show(index);
  overlayHost(options.container).append(dialog);

  const releaseModal = modal(dialog, { onEscape: dismiss });
  const stopWatching = watchSize(stage, (width, height) => {
    area = { width, height };
  });

  return { show, close };
}
