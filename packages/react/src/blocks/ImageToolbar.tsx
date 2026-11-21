import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { Icon, type IconName } from '../icons/Icon';
import { CommitInput } from './CommitInput';

const ALIGNS: ReadonlyArray<{ value: string; label: MessageKey; icon: IconName }> = [
  { value: 'left', label: 'image.align.left', icon: 'align-left' },
  { value: 'center', label: 'image.align.center', icon: 'align-center' },
  { value: 'right', label: 'image.align.right', icon: 'align-right' },
];

interface ToolButtonProps {
  readonly icon: IconName;
  readonly label: string;
  readonly name: string;
  readonly pressed?: boolean;
  onClick(): void;
}

function ToolButton({ icon, label, name, pressed, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className="image-tools__button"
      data-inkbrick-part="tool"
      data-tool={name}
      data-pressed={pressed || undefined}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

interface PopoverProps {
  readonly icon: IconName;
  readonly label: string;
  readonly name: string;
  /** `menu` — список пунктов со стрелками; `group` — панель с полем и кнопками (Tab). */
  readonly kind: 'menu' | 'group';
  readonly children: (close: () => void) => ReactNode;
}

/** Кнопка панели с выпадающей панелью: закрывается Escape, щелчком мимо и выбором пункта. */
function ToolPopover({ icon, label, name, kind, children }: PopoverProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };

  const items = () => [
    ...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? []),
  ];

  useEffect(() => {
    if (!open) return;

    const first =
      items().find((item) => item.getAttribute('aria-checked') === 'true') ?? items()[0];

    first?.focus({ preventScroll: true });

    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && !panel.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', outside, true);

    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();

      return;
    }

    if (kind !== 'menu' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;

    event.preventDefault();

    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;

    all[(index + step + all.length) % all.length]?.focus();
  };

  return (
    <span data-inkbrick-part="tool-wrap">
      <button
        ref={trigger}
        type="button"
        className="image-tools__button"
        data-inkbrick-part="tool"
        data-tool={name}
        aria-label={label}
        aria-haspopup={kind === 'menu' ? 'menu' : 'true'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role={kind}
          aria-label={label}
          data-inkbrick-part="tool-popover"
          data-popover={name}
          onKeyDown={key}
        >
          {children(() => close())}
        </div>
      )}
    </span>
  );
}

export interface ImageToolbarProps {
  readonly align: string;
  readonly alt: string;
  readonly captionShown: boolean;
  readonly cropped: boolean;
  readonly readOnly: boolean;
  onAlign(align: string): void;
  onToggleCaption(): void;
  onCrop(): void;
  onView(): void;
  onDownload(): void;
  onDownloadOriginal(): void;
  onAlt(alt: string): void;
  onReplace(): void;
  onResetCrop(): void;
}

/**
 * Панель картинки: расположение, подпись, обрезка, просмотр во весь экран, скачивание и «ещё» (альтернативный текст,
 * замена, сброс обрезки, оригинал). В режиме чтения — только просмотр и скачивание.
 */
export function ImageToolbar(props: ImageToolbarProps) {
  const t = useT();
  const current = ALIGNS.find((item) => item.value === props.align) ?? ALIGNS[1];

  return (
    <div
      className="image-tools"
      data-inkbrick-part="tools"
      data-inkbrick-ignore-input=""
      role="toolbar"
      aria-label={t('image.options')}
    >
      {!props.readOnly && (
        <>
          <ToolPopover icon={current.icon} label={t('image.align')} name="align" kind="menu">
            {(close) =>
              ALIGNS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.align === value}
                  data-inkbrick-part="tool-item"
                  data-align={value}
                  tabIndex={-1}
                  onClick={() => {
                    props.onAlign(value);
                    close();
                  }}
                >
                  <Icon name={icon} />
                  <span>{t(label)}</span>
                </button>
              ))
            }
          </ToolPopover>
          <ToolButton
            icon="captions"
            name="caption"
            label={props.captionShown ? t('image.caption.hide') : t('image.caption.show')}
            pressed={props.captionShown}
            onClick={props.onToggleCaption}
          />
          <ToolButton
            icon="crop"
            name="crop"
            label={t('image.crop')}
            pressed={props.cropped}
            onClick={props.onCrop}
          />
        </>
      )}
      <ToolButton icon="maximize" name="view" label={t('image.view')} onClick={props.onView} />
      <ToolButton
        icon="download"
        name="download"
        label={t('image.download')}
        onClick={props.onDownload}
      />
      {!props.readOnly && (
        <ToolPopover icon="ellipsis" label={t('image.more')} name="more" kind="group">
          {(close) => (
            <>
              <label data-inkbrick-part="tool-field">
                <span>{t('image.alt')}</span>
                <CommitInput
                  className="image-tools__alt"
                  part="alt"
                  label={t('image.alt')}
                  placeholder={t('image.alt')}
                  value={props.alt}
                  onCommit={props.onAlt}
                />
              </label>
              <button
                type="button"
                data-inkbrick-part="tool-item"
                data-action="replace"
                onClick={() => {
                  close();
                  props.onReplace();
                }}
              >
                <Icon name="refresh-cw" />
                <span>{t('image.replace')}</span>
              </button>
              {props.cropped && (
                <>
                  <button
                    type="button"
                    data-inkbrick-part="tool-item"
                    data-action="reset-crop"
                    onClick={() => {
                      close();
                      props.onResetCrop();
                    }}
                  >
                    <Icon name="crop" />
                    <span>{t('image.crop.reset')}</span>
                  </button>
                  <button
                    type="button"
                    data-inkbrick-part="tool-item"
                    data-action="download-original"
                    onClick={() => {
                      close();
                      props.onDownloadOriginal();
                    }}
                  >
                    <Icon name="download" />
                    <span>{t('image.downloadOriginal')}</span>
                  </button>
                </>
              )}
            </>
          )}
        </ToolPopover>
      )}
    </div>
  );
}

const MIN_WIDTH = 10;
const MAX_WIDTH = 100;

const clampWidth = (value: number) =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value * 10) / 10));

export interface ResizeHandlesProps {
  readonly width: number;
  readonly align: string;
  /** Ширина, пока тянут (для показа), или `null`, когда отпустили. */
  onPreview(width: number | null): void;
  onCommit(width: number): void;
}

/**
 * Боковые ручки ширины картинки: тянут мышью или пальцем (в процентах ширины документа; у картинки по центру ширина
 * меняется с обеих сторон, поэтому вдвое быстрее), стрелками — по 5 %, Home и End — наименьшая и полная ширина.
 * В документ ширина попадает один раз, когда ручку отпустили.
 */
export function ResizeHandles({ width, align, onPreview, onCommit }: ResizeHandlesProps) {
  const t = useT();
  const drag = useRef<{ pointer: number; x: number; start: number; box: number } | null>(null);
  const last = useRef(width);

  const down = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;

    const container = event.currentTarget.closest('[data-inkbrick-block="image"]');
    const box = container?.getBoundingClientRect().width ?? 0;

    if (box <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, start: width, box };
    last.current = width;
  };

  const move = (event: ReactPointerEvent<HTMLSpanElement>, side: 'start' | 'end') => {
    const current = drag.current;

    if (!current || current.pointer !== event.pointerId) return;

    const delta = (event.clientX - current.x) * (side === 'end' ? 1 : -1);
    const next = clampWidth(
      current.start + ((delta * (align === 'center' ? 2 : 1)) / current.box) * 100,
    );

    last.current = next;
    onPreview(next);
  };

  const up = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const current = drag.current;

    if (!current || current.pointer !== event.pointerId) return;

    drag.current = null;
    onPreview(null);
    if (last.current !== current.start) onCommit(last.current);
  };

  const key = (event: KeyboardEvent<HTMLSpanElement>) => {
    const steps: Record<string, number> = {
      ArrowRight: 5,
      ArrowUp: 5,
      ArrowLeft: -5,
      ArrowDown: -5,
      PageUp: 10,
      PageDown: -10,
    };
    let next: number | null = null;

    if (event.key in steps) next = clampWidth(width + steps[event.key]);
    else if (event.key === 'Home') next = MIN_WIDTH;
    else if (event.key === 'End') next = MAX_WIDTH;

    if (next === null) return;

    event.preventDefault();
    event.stopPropagation();
    if (next !== width) onCommit(next);
  };

  return (
    <>
      {(['start', 'end'] as const).map((side) => (
        <span
          key={side}
          data-inkbrick-part="resize"
          data-inkbrick-ignore-input=""
          data-side={side}
          role="slider"
          tabIndex={0}
          aria-label={t('image.width')}
          aria-orientation="horizontal"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={Math.round(width)}
          aria-valuetext={`${Math.round(width)}%`}
          onPointerDown={down}
          onPointerMove={(event) => move(event, side)}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
        />
      ))}
    </>
  );
}
