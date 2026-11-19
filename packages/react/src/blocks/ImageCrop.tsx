import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import {
  IMAGE_ASPECTS,
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  type ImageAspect,
} from '@inkbrick/document';

import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { Icon } from '../icons/Icon';
import { DEFAULT_CROP, frameRatio, panBy, placement, zoomed, type Crop } from '../images/crop';

interface FrameProps {
  readonly src: string;
  readonly alt: string;
  readonly crop: Crop;
  /** Отношение сторон самой картинки (`null`, пока она не загружена). */
  readonly natural: number | null;
  readonly onNatural: (ratio: number) => void;
  readonly onError: () => void;
}

/** Кадр с картинкой: пропорции заданы кадром, картинка закрывает его и сдвинута и увеличена по кадрированию. */
export function ImageFrame({ src, alt, crop, natural, onNatural, onError }: FrameProps) {
  const ratio = frameRatio(crop.aspect, natural);
  const place = placement(crop, ratio, natural);

  return (
    <div
      className="image-frame"
      data-inkbrick-part="frame"
      data-aspect={crop.aspect}
      style={{ aspectRatio: String(ratio) }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-inkbrick-part="image"
        referrerPolicy="no-referrer"
        style={{
          left: `${place.left}%`,
          top: `${place.top}%`,
          width: `${place.width}%`,
          height: `${place.height}%`,
        }}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;

          if (naturalWidth > 0 && naturalHeight > 0) onNatural(naturalWidth / naturalHeight);
        }}
        onError={onError}
      />
    </div>
  );
}

interface CropperProps extends Omit<FrameProps, 'crop'> {
  readonly initial: Crop;
  readonly onDone: (crop: Crop) => void;
  readonly onCancel: () => void;
}

const NUDGE = 2;
const ZOOM_STEP = 0.1;

/**
 * Редактор кадра: картинку двигают пальцем или мышью, масштаб меняют щипком, ползунком или клавишами «+» и «−»,
 * пропорции выбирают из ряда. Изменения видны сразу, но в документ попадают одним шагом по «Готово» (undo — один).
 */
export function ImageCropper({
  src,
  alt,
  initial,
  natural,
  onNatural,
  onError,
  onDone,
  onCancel,
}: CropperProps) {
  const t = useT();
  const [draft, setDraft] = useState<Crop>(initial);
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const ratio = frameRatio(draft.aspect, natural);

  const size = () => {
    const box = frame.current?.getBoundingClientRect();

    return { width: box?.width || 1, height: box?.height || 1 };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);

    if (!last) return;

    const next = { x: event.clientX, y: event.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId);

    if (others.length === 0) {
      setDraft((crop) => panBy(crop, next.x - last.x, next.y - last.y, size(), ratio, natural));
    } else {
      // Щипок: масштаб меняется в отношении расстояний между пальцами до и после.
      const other = others[0][1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);

      if (before > 4) setDraft((crop) => zoomed(crop, crop.zoom * (after / before)));
    }

    pointers.current.set(event.pointerId, next);
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [NUDGE, 0],
      ArrowRight: [-NUDGE, 0],
      ArrowUp: [0, NUDGE],
      ArrowDown: [0, -NUDGE],
    };
    const arrow = arrows[event.key];

    if (arrow) {
      event.preventDefault();
      // Стрелка сдвигает показанную часть: вправо — картинка уходит вправо (положение уменьшается).
      setDraft((crop) => ({
        ...crop,
        x: Math.min(100, Math.max(0, crop.x + arrow[0] * -1)),
        y: Math.min(100, Math.max(0, crop.y + arrow[1] * -1)),
      }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setDraft((crop) => zoomed(crop, crop.zoom + ZOOM_STEP));
    } else if (event.key === '-') {
      event.preventDefault();
      setDraft((crop) => zoomed(crop, crop.zoom - ZOOM_STEP));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onDone(draft);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="image-crop" data-inkbrick-part="crop" data-testid="image-crop">
      <div
        ref={frame}
        className="image-crop__frame"
        data-inkbrick-part="crop-frame"
        role="group"
        tabIndex={0}
        aria-label={t('image.crop.frame')}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={key}
      >
        <ImageFrame
          src={src}
          alt={alt}
          crop={draft}
          natural={natural}
          onNatural={onNatural}
          onError={onError}
        />
      </div>

      <p className="image-crop__hint" data-inkbrick-part="crop-hint">
        {t('image.crop.hint')}
      </p>

      <div
        className="image-crop__aspects"
        data-inkbrick-part="crop-aspects"
        role="radiogroup"
        aria-label={t('image.crop.aspect')}
      >
        {IMAGE_ASPECTS.map((aspect: ImageAspect) => (
          <button
            key={aspect}
            type="button"
            role="radio"
            aria-checked={draft.aspect === aspect}
            data-inkbrick-part="crop-aspect"
            data-aspect={aspect}
            onClick={() => setDraft((crop) => ({ ...crop, aspect }))}
          >
            {t(`image.crop.aspect.${aspect}` as MessageKey)}
          </button>
        ))}
      </div>

      <label className="image-crop__zoom" data-inkbrick-part="crop-zoom">
        <span>{t('image.crop.zoom')}</span>
        <input
          type="range"
          min={IMAGE_ZOOM_MIN}
          max={IMAGE_ZOOM_MAX}
          step={0.05}
          value={draft.zoom}
          aria-label={t('image.crop.zoom')}
          onChange={(event) => setDraft((crop) => zoomed(crop, Number(event.target.value)))}
        />
        <output>{Math.round(draft.zoom * 100)}%</output>
      </label>

      <div className="image-crop__actions" data-inkbrick-part="crop-actions">
        <button
          type="button"
          data-inkbrick-part="crop-reset"
          onClick={() => setDraft({ ...DEFAULT_CROP })}
        >
          <Icon name="refresh-cw" />
          {t('image.crop.reset')}
        </button>
        <span />
        <button type="button" data-inkbrick-part="crop-cancel" onClick={onCancel}>
          {t('image.crop.cancel')}
        </button>
        <button
          type="button"
          data-inkbrick-part="crop-done"
          data-primary=""
          onClick={() => onDone(draft)}
        >
          <Icon name="check" />
          {t('image.crop.done')}
        </button>
      </div>
    </div>
  );
}
