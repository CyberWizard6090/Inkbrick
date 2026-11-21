import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { downloadImage, fileNameFor } from './download';
import { ToolIcon } from './icons';
import { overlayHost, useElementSize, useModal } from './modal';

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

export interface ImageViewerProps {
  readonly images: readonly ViewerImage[];
  /** Какая картинка открыта. */
  readonly index: number;
  onIndexChange?(index: number): void;
  onClose(): void;
  /** Своё сохранение (например, файла после обрезки); по умолчанию — `downloadImage`. */
  onDownload?(image: ViewerImage): void;
  readonly labels?: Partial<ViewerLabels>;
  readonly container?: Element | null;
  readonly theme?: 'light' | 'dark';
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
 * Просмотр картинки во весь экран: картинка вписана в окно; снизу — «назад» и «вперёд» по списку, масштаб, сохранение и
 * закрытие. Колесо и щипок меняют масштаб, увеличенную картинку двигают мышью или пальцем, двойной щелчок увеличивает
 * вдвое и возвращает обратно. Клавиши: стрелки — соседние картинки, «+» и «−» — масштаб, 0 — вписать, Escape — закрыть.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
  onDownload,
  labels: own,
  container,
  theme,
}: ImageViewerProps) {
  const labels = { ...DEFAULT_VIEWER_LABELS, ...own };
  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const image = images[index];
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const area = useElementSize(stage);
  const onKeyDown = useModal(dialog, onClose);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
  }, [index]);

  // Размер вписанной картинки (в px): по нему сдвиг ограничивается так, чтобы картинка не уходила из окна.
  let fitted = { width: 0, height: 0 };

  if (natural && area) {
    const scale = Math.min(1, area.width / natural.width, area.height / natural.height);

    fitted = { width: natural.width * scale, height: natural.height * scale };
  }

  const limit = (next: { x: number; y: number }, scale: number) => {
    if (!area) return next;

    const spareX = Math.max(0, (fitted.width * scale - area.width) / 2);
    const spareY = Math.max(0, (fitted.height * scale - area.height) / 2);

    return { x: clamp(next.x, -spareX, spareX), y: clamp(next.y, -spareY, spareY) };
  };

  const applyZoom = (next: number) => {
    const scale = clamp(next, MIN_ZOOM, MAX_ZOOM);

    setZoom(scale);
    setOffset((current) => limit(current, scale));
  };

  const go = (step: 1 | -1) => {
    const next = index + step;

    if (next >= 0 && next < images.length) onIndexChange?.(next);
  };

  const download = () => {
    if (!image) return;

    if (onDownload) onDownload(image);
    else void downloadImage(image.src, image.name ?? fileNameFor(image.src));
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // Стрелки на кнопках панели — переход по кнопкам не нужен, а клавиши должны работать везде в окне.
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
      applyZoom(1);
      setOffset({ x: 0, y: 0 });
    } else {
      onKeyDown(event);
    }
  };

  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;

    applyZoom(zoom * Math.exp(-event.deltaY * 0.0015));
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);

    if (!last) return;

    const next = { x: event.clientX, y: event.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId);

    if (Math.hypot(next.x - last.x, next.y - last.y) > 2) moved.current = true;

    if (others.length > 0) {
      // Щипок: масштаб меняется в отношении расстояний между пальцами.
      const other = others[0][1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);

      if (before > 4) applyZoom(zoom * (after / before));
    } else if (zoom > 1) {
      setOffset((current) =>
        limit({ x: current.x + next.x - last.x, y: current.y + next.y - last.y }, zoom),
      );
    }

    pointers.current.set(event.pointerId, next);
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const host = overlayHost(container);

  if (!host || !image) return null;

  return createPortal(
    <div
      ref={dialog}
      data-inkbrick-ui="image-viewer"
      data-inkbrick-theme={theme}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={labels.dialog}
      data-testid="image-viewer"
      onKeyDown={key}
    >
      <div
        ref={stage}
        data-inkbrick-part="viewer-stage"
        data-zoomed={zoom > 1 || undefined}
        onWheel={wheel}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={(event) => {
          // Щелчок мимо картинки закрывает окно (но не конец перетаскивания).
          if (event.target === event.currentTarget && !moved.current) onClose();
        }}
      >
        <img
          key={image.src}
          src={image.src}
          alt={image.alt ?? ''}
          draggable={false}
          referrerPolicy="no-referrer"
          data-inkbrick-part="viewer-image"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;

            if (naturalWidth > 0) setNatural({ width: naturalWidth, height: naturalHeight });
          }}
          onDoubleClick={() => {
            applyZoom(zoom > 1 ? 1 : 2);
            if (zoom > 1) setOffset({ x: 0, y: 0 });
          }}
        />
      </div>

      <div data-inkbrick-part="viewer-bar" role="toolbar" aria-label={labels.dialog}>
        {images.length > 1 && (
          <div data-inkbrick-part="viewer-group">
            <button
              type="button"
              data-inkbrick-part="viewer-previous"
              aria-label={labels.previous}
              title={labels.previous}
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <ToolIcon name="arrow-left" />
            </button>
            <button
              type="button"
              data-inkbrick-part="viewer-next"
              aria-label={labels.next}
              title={labels.next}
              disabled={index === images.length - 1}
              onClick={() => go(1)}
            >
              <ToolIcon name="arrow-right" />
            </button>
          </div>
        )}
        <div data-inkbrick-part="viewer-group">
          <button
            type="button"
            data-inkbrick-part="viewer-zoom-out"
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            disabled={zoom <= MIN_ZOOM + 1e-6}
            onClick={() => applyZoom(stepZoom(zoom, -1))}
          >
            <ToolIcon name="minus" />
          </button>
          <button
            type="button"
            data-inkbrick-part="viewer-zoom"
            aria-label={`${labels.zoomReset} (${Math.round(zoom * 100)}%)`}
            title={labels.zoomReset}
            onClick={() => {
              applyZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            data-inkbrick-part="viewer-zoom-in"
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            disabled={zoom >= MAX_ZOOM - 1e-6}
            onClick={() => applyZoom(stepZoom(zoom, 1))}
          >
            <ToolIcon name="plus" />
          </button>
        </div>
        <div data-inkbrick-part="viewer-group">
          <button
            type="button"
            data-inkbrick-part="viewer-download"
            aria-label={labels.download}
            title={labels.download}
            onClick={download}
          >
            <ToolIcon name="download" />
          </button>
          <button
            type="button"
            data-inkbrick-part="viewer-close"
            aria-label={labels.close}
            title={labels.close}
            onClick={onClose}
          >
            <ToolIcon name="minimize" />
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}
