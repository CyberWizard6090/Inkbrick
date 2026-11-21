import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  CROP_HANDLES,
  CROP_RATIOS,
  FULL_RECT,
  clampRect,
  fitRatio,
  isFullRect,
  isPortrait,
  landscapeOf,
  moveRect,
  oriented,
  relativeRatio,
  resizeRect,
  roundRect,
  type CropAspect,
  type CropHandle,
  type CropRect,
} from './geometry';
import { ToolIcon, type ToolIconName } from './icons';
import { overlayHost, useElementSize, useModal } from './modal';

/** Надписи окна обрезки (по умолчанию английские). */
export interface CropperLabels {
  readonly title: string;
  readonly cancel: string;
  readonly save: string;
  /** Кнопка меню форм. */
  readonly shape: string;
  readonly free: string;
  readonly circle: string;
  readonly square: string;
  readonly portrait: string;
  readonly landscape: string;
  /** Подпись рамки для программ чтения с экрана: как ею управлять. */
  readonly frame: string;
}

export const DEFAULT_CROPPER_LABELS: CropperLabels = {
  title: 'Crop image',
  cancel: 'Cancel',
  save: 'Save',
  shape: 'Shape',
  free: 'Freeform',
  circle: 'Circle',
  square: 'Square',
  portrait: 'Portrait',
  landscape: 'Landscape',
  frame:
    'Crop area: drag to move, drag the edges to resize; arrow keys move it, Shift with arrows resizes',
};

/** Что выбрал пользователь: рамка в долях картинки, форма и размер самой картинки в пикселях. */
export interface CropResult {
  readonly rect: CropRect;
  readonly aspect: CropAspect;
  readonly natural: { readonly width: number; readonly height: number };
}

export interface ImageCropperProps {
  readonly src: string;
  readonly alt?: string;
  /** Рамка, с которой окно открывается (по умолчанию — вся картинка). */
  readonly initialRect?: CropRect;
  readonly initialAspect?: CropAspect;
  readonly labels?: Partial<CropperLabels>;
  /** Куда вставить окно (по умолчанию `document.body`). */
  readonly container?: Element | null;
  /** Тема окна (`data-inkbrick-theme`), если она задана не на странице целиком. */
  readonly theme?: 'light' | 'dark';
  /** Сохранение идёт: кнопки заблокированы. */
  readonly busy?: boolean;
  onSave(result: CropResult): void;
  onCancel(): void;
  /** Картинка не загрузилась (по умолчанию окно закрывается как по «Отмене»). */
  onError?(): void;
}

const STEP = 0.01;
const BIG_STEP = 0.1;
/** Наименьшая сторона рамки на экране, px. */
const MIN_PX = 24;

interface Drag {
  readonly pointer: number;
  readonly handle: CropHandle | null;
  readonly x: number;
  readonly y: number;
  readonly start: CropRect;
}

const shapeIcon = (aspect: CropAspect): ToolIconName =>
  aspect === 'free'
    ? 'frame'
    : aspect === 'circle'
      ? 'circle'
      : aspect === '1:1'
        ? 'square'
        : isPortrait(aspect)
          ? 'portrait'
          : 'landscape';

/**
 * Окно обрезки во весь экран: картинка с рамкой, которую двигают и тянут за стороны и углы; сверху — меню форм (свободная,
 * круг, квадрат, пропорции в книжной и альбомной ориентации), «Отмена» и «Сохранить». Окно ничего не меняет само:
 * результат приходит в `onSave`, файл из него делает `cropImage`.
 */
export function ImageCropper({
  src,
  alt = '',
  initialRect = FULL_RECT,
  initialAspect = 'free',
  labels: own,
  container,
  theme,
  busy = false,
  onSave,
  onCancel,
  onError = onCancel,
}: ImageCropperProps) {
  const labels = { ...DEFAULT_CROPPER_LABELS, ...own };
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<CropRect>(() => clampRect(initialRect));
  const [aspect, setAspect] = useState<CropAspect>(initialAspect);
  const [portrait, setPortrait] = useState(isPortrait(initialAspect));
  const [menu, setMenu] = useState(false);
  const drag = useRef<Drag | null>(null);
  const area = useElementSize(stage);
  const onKeyDown = useModal(dialog, () => (menu ? setMenu(false) : onCancel()), box);

  const ready = !!natural && !!area;

  // Рамка видна, только когда картинка загружена: тогда фокус и переходит на неё (если он ещё на самом окне).
  useEffect(() => {
    if (
      ready &&
      (document.activeElement === dialog.current ||
        !dialog.current?.contains(document.activeElement))
    ) {
      box.current?.focus({ preventScroll: true });
    }
  }, [ready]);

  const imageRatio = natural ? natural.width / natural.height : 1;
  const ratio = relativeRatio(aspect, imageRatio);

  // Картинка вписана в свободное место окна (и может быть увеличена, если она маленькая).
  let shown = { width: 0, height: 0 };

  if (natural && area) {
    const scale = Math.min(area.width / natural.width, area.height / natural.height);

    shown = { width: natural.width * scale, height: natural.height * scale };
  }

  const min = {
    width: shown.width > 0 ? Math.min(1, MIN_PX / shown.width) : 0.05,
    height: shown.height > 0 ? Math.min(1, MIN_PX / shown.height) : 0.05,
  };

  const choose = (next: CropAspect) => {
    setAspect(next);
    setMenu(false);

    if (next !== 'free' && next !== 'circle' && next !== '1:1') setPortrait(isPortrait(next));
    if (natural) {
      setRect((current) => fitRatio(current, relativeRatio(next, natural.width / natural.height)));
    }

    box.current?.focus({ preventScroll: true });
  };

  const save = () => {
    if (!natural || busy) return;

    onSave({ rect: roundRect(rect), aspect, natural });
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, handle: CropHandle | null) => {
    if (event.button !== 0 || busy) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    box.current?.focus({ preventScroll: true });
    drag.current = {
      pointer: event.pointerId,
      handle,
      x: event.clientX,
      y: event.clientY,
      start: rect,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;

    if (!current || current.pointer !== event.pointerId || shown.width === 0) return;

    const dx = (event.clientX - current.x) / shown.width;
    const dy = (event.clientY - current.y) / shown.height;

    setRect(
      current.handle
        ? resizeRect(current.start, current.handle, dx, dy, ratio, min)
        : moveRect(current.start, dx, dy),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const arrow = arrows[event.key];

    if (arrow) {
      event.preventDefault();

      const step = event.ctrlKey || event.metaKey ? BIG_STEP : STEP;
      const [x, y] = arrow;

      setRect((current) =>
        event.shiftKey
          ? resizeRect(current, 'se', x * step, y * step, ratio, min)
          : moveRect(current, x * step, y * step),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  };

  const host = overlayHost(container);

  if (!host) return null;

  return createPortal(
    <div
      ref={dialog}
      data-inkbrick-ui="image-cropper"
      data-inkbrick-theme={theme}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-labelledby={titleId}
      data-testid="image-cropper"
      onKeyDown={onKeyDown}
    >
      <div data-inkbrick-part="cropper-panel">
        <div data-inkbrick-part="cropper-bar">
          <ShapeMenu
            aspect={aspect}
            portrait={portrait}
            open={menu}
            labels={labels}
            onToggle={() => setMenu((open) => !open)}
            onClose={() => setMenu(false)}
            onChoose={choose}
          />
          <h2 id={titleId} data-inkbrick-part="cropper-title">
            {labels.title}
          </h2>
          <div data-inkbrick-part="cropper-actions">
            <button
              type="button"
              data-inkbrick-part="cropper-cancel"
              disabled={busy}
              onClick={onCancel}
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              data-inkbrick-part="cropper-save"
              data-primary=""
              data-busy={busy || undefined}
              disabled={busy || !natural}
              onClick={save}
            >
              {labels.save}
            </button>
          </div>
        </div>

        <div ref={stage} data-inkbrick-part="cropper-stage">
          <div
            data-inkbrick-part="cropper-canvas"
            data-ready={ready ? '' : undefined}
            style={{ width: shown.width || undefined, height: shown.height || undefined }}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              referrerPolicy="no-referrer"
              data-inkbrick-part="cropper-image"
              onError={onError}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;

                if (naturalWidth > 0 && naturalHeight > 0) {
                  setNatural({ width: naturalWidth, height: naturalHeight });
                  // Форма задана, а рамка — вся картинка: рамка сразу принимает её пропорции.
                  if (isFullRect(rect)) {
                    setRect(fitRatio(rect, relativeRatio(aspect, naturalWidth / naturalHeight)));
                  }
                  if (initialAspect === 'free' && naturalHeight > naturalWidth) setPortrait(true);
                }
              }}
            />
            {/* Затемнение вокруг рамки обрезано краями картинки; сама рамка с ручками — поверх и может выходить за край. */}
            <div data-inkbrick-part="cropper-shade-clip" aria-hidden="true">
              <div
                data-inkbrick-part="cropper-shade"
                data-shape={aspect === 'circle' ? 'circle' : 'rect'}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              />
            </div>
            <div
              ref={box}
              data-inkbrick-part="cropper-box"
              data-shape={aspect === 'circle' ? 'circle' : 'rect'}
              role="group"
              tabIndex={0}
              aria-label={labels.frame}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
              onPointerDown={(event) => startDrag(event, null)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={key}
            >
              {CROP_HANDLES.map((handle) => (
                <span
                  key={handle}
                  data-inkbrick-part="cropper-handle"
                  data-handle={handle}
                  aria-hidden="true"
                  onPointerDown={(event) => startDrag(event, handle)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    host,
  );
}

interface ShapeMenuProps {
  readonly aspect: CropAspect;
  readonly portrait: boolean;
  readonly open: boolean;
  readonly labels: CropperLabels;
  onToggle(): void;
  onClose(): void;
  onChoose(aspect: CropAspect): void;
}

/** Меню форм рамки: свободная, круг, квадрат и пропорции; у пропорций — переключатель книжной и альбомной ориентации. */
function ShapeMenu({
  aspect,
  portrait,
  open,
  labels,
  onToggle,
  onClose,
  onChoose,
}: ShapeMenuProps) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = landscapeOf(aspect);

  // Нажатие мимо меню закрывает его.
  useEffect(() => {
    if (!open) return;

    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && !list.current?.contains(target) && !trigger.current?.contains(target))
        onClose();
    };

    document.addEventListener('pointerdown', outside, true);

    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, onClose]);

  const items = () => [
    ...(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []),
  ];

  const close = () => {
    onClose();
    trigger.current?.focus({ preventScroll: true });
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      const step = event.key === 'ArrowDown' ? 1 : -1;

      all[(index + step + all.length) % all.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? all[0] : all[all.length - 1])?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      onClose();
    }
  };

  const item = (value: CropAspect, label: string, part = 'cropper-shape') => (
    <button
      key={value}
      type="button"
      role="menuitemradio"
      aria-checked={aspect === value}
      data-inkbrick-part={part}
      data-aspect={value}
      tabIndex={-1}
      onClick={() => onChoose(value)}
    >
      <span>{label}</span>
      {aspect === value && <ToolIcon name="check" />}
    </button>
  );

  return (
    <div data-inkbrick-part="cropper-shapes">
      <button
        ref={trigger}
        type="button"
        data-inkbrick-part="cropper-shape-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={labels.shape}
        title={labels.shape}
        onClick={() => {
          onToggle();
          if (!open)
            requestAnimationFrame(
              () =>
                items()
                  .find((el) => el.getAttribute('aria-checked') === 'true')
                  ?.focus() ?? items()[0]?.focus(),
            );
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            onToggle();
            requestAnimationFrame(() => items()[0]?.focus());
          }
        }}
      >
        <ToolIcon name={shapeIcon(aspect)} />
        <ToolIcon name="chevron-down" />
      </button>
      {open && (
        <div
          ref={list}
          id={menuId}
          role="menu"
          aria-label={labels.shape}
          data-inkbrick-part="cropper-menu"
          onKeyDown={key}
        >
          {item('free', labels.free)}
          <div role="separator" data-inkbrick-part="cropper-separator" />
          {item('circle', labels.circle)}
          {item('1:1', labels.square)}
          {CROP_RATIOS.map((ratio) => {
            const value = oriented(ratio, portrait);
            const chosen = current === ratio;

            return (
              <div
                key={ratio}
                role="none"
                data-inkbrick-part="cropper-ratio"
                data-checked={chosen || undefined}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={chosen}
                  data-inkbrick-part="cropper-shape"
                  data-aspect={value}
                  tabIndex={-1}
                  onClick={() => onChoose(chosen ? aspect : value)}
                >
                  <span>{ratio}</span>
                </button>
                {(['portrait', 'landscape'] as const).map((side) => {
                  const choice = oriented(ratio, side === 'portrait');
                  const on = chosen ? aspect === choice : portrait === (side === 'portrait');

                  return (
                    <button
                      key={side}
                      type="button"
                      role="menuitemradio"
                      aria-checked={chosen && aspect === choice}
                      aria-label={`${ratio} ${labels[side]}`}
                      title={labels[side]}
                      data-inkbrick-part="cropper-orientation"
                      data-aspect={choice}
                      data-pressed={on || undefined}
                      tabIndex={-1}
                      onClick={() => onChoose(choice)}
                    >
                      <ToolIcon name={side} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
