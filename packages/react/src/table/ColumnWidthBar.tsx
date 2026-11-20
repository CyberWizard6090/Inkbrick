import { useEffect, useRef } from 'react';

import { useT } from '../hooks/useT';

export interface ColumnWidthBarProps {
  /** Номер столбца с единицы. */
  readonly column: number;
  readonly min: number;
  readonly max: number;
  /** Текущая ширина столбца в пикселях. */
  readonly value: number;
  /** Столбец без своей ширины (по содержимому): кнопка сброса не нужна. */
  readonly auto: boolean;
  /** Движение ползунка: живой предпросмотр без записи в документ. */
  readonly onInput: (width: number) => void;
  /** Палец отпущен (или шаг кнопкой): ширина записывается одним шагом отмены. */
  readonly onCommit: (width: number) => void;
  readonly onAuto: () => void;
  readonly onClose: () => void;
}

/** Шаг кнопок «−» и «+»: палец точнее попадает в кнопку, чем в пиксель ползунка. */
const NUDGE = 1;

/**
 * Панель ширины столбца для телефона: на экране нет правой кнопки и тонкой границы под палец, поэтому ширина задаётся
 * ползунком. Он тянет таблицу вживую, а запись в документ (один шаг отмены) — когда палец отпущен.
 */
export function ColumnWidthBar({
  column,
  min,
  max,
  value,
  auto,
  onInput,
  onCommit,
  onAuto,
  onClose,
}: ColumnWidthBarProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Последнее значение ползунка: отпускание пальца записывает именно его, а не то, что успело перерисоваться.
  const latest = useRef(value);

  latest.current = value;

  const clamp = (width: number) => Math.min(max, Math.max(min, Math.round(width)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="inkbrick-column-width-bar"
      data-inkbrick-ui="column-width-bar"
      data-inkbrick-block-ui
      role="group"
      aria-label={t('table.width.label', { column })}
      // Поле ввода и кнопки не уводят фокус и выделение из документа.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      <div data-inkbrick-part="head">
        <span data-inkbrick-part="title">{t('table.width.label', { column })}</span>
        <output data-inkbrick-part="value" aria-live="off">
          {`${Math.round(value)} px`}
          {auto ? ` · ${t('table.width.auto')}` : ''}
        </output>
      </div>
      <div data-inkbrick-part="track">
        <button
          type="button"
          data-inkbrick-part="nudge"
          data-action="column-width-narrower"
          aria-label={t('table.column.narrower')}
          disabled={value <= min}
          onClick={() => onCommit(clamp(value - NUDGE))}
        >
          −
        </button>
        <input
          type="range"
          data-inkbrick-part="slider"
          min={min}
          max={Math.max(min, max)}
          step={1}
          value={clamp(value)}
          aria-label={t('table.width.label', { column })}
          onChange={(event) => {
            latest.current = Number(event.currentTarget.value);
            onInput(latest.current);
          }}
          onPointerUp={() => onCommit(latest.current)}
          onKeyUp={(event) => {
            if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')
              onCommit(Number(event.currentTarget.value));
          }}
        />
        <button
          type="button"
          data-inkbrick-part="nudge"
          data-action="column-width-wider"
          aria-label={t('table.column.wider')}
          disabled={value >= max}
          onClick={() => onCommit(clamp(value + NUDGE))}
        >
          +
        </button>
      </div>
      <div data-inkbrick-part="actions">
        <button
          type="button"
          data-inkbrick-part="auto"
          data-action="column-width-auto"
          disabled={auto}
          onClick={onAuto}
        >
          {t('table.width.fit')}
        </button>
        <button
          type="button"
          data-inkbrick-part="done"
          data-action="column-width-done"
          onClick={onClose}
        >
          {t('table.width.done')}
        </button>
      </div>
    </div>
  );
}
