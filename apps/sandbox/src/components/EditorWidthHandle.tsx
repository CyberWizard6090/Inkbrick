import { useState, type KeyboardEvent, type PointerEvent } from 'react';

import {
  DEFAULT_EDITOR_WIDTH,
  MIN_EDITOR_WIDTH,
  clampEditorWidth,
  maxEditorWidth,
} from '../editorWidth';
import { useSandboxI18n } from '../i18n';

const KEY_STEP = 16;

/**
 * Ручка слева от редактора: тянется мышью или пальцем и меняет ширину области редактора (она стоит по центру, поэтому
 * ширина меняется на удвоенное смещение). Стрелки — шаг 16 px (с Shift — 64), Home / End — самая узкая и самая широкая,
 * двойной клик — ширина по умолчанию.
 */
export function EditorWidthHandle({
  width,
  onChange,
}: {
  readonly width: number;
  onChange(width: number): void;
}) {
  const { t } = useSandboxI18n();
  const [dragging, setDragging] = useState(false);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();

    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;

    handle.setPointerCapture(event.pointerId);
    setDragging(true);

    const move = (moved: globalThis.PointerEvent) =>
      onChange(clampEditorWidth(startWidth + 2 * (startX - moved.clientX)));
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      setDragging(false);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const next =
      event.key === 'ArrowLeft'
        ? width + step
        : event.key === 'ArrowRight'
          ? width - step
          : event.key === 'Home'
            ? MIN_EDITOR_WIDTH
            : event.key === 'End'
              ? maxEditorWidth()
              : null;

    if (next === null) return;

    event.preventDefault();
    onChange(clampEditorWidth(next));
  };

  return (
    <div
      className="editor-width-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('editorWidth.label')}
      aria-valuemin={MIN_EDITOR_WIDTH}
      aria-valuemax={maxEditorWidth()}
      aria-valuenow={width}
      title={t('editorWidth.title')}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={start}
      onKeyDown={key}
      onDoubleClick={() => onChange(clampEditorWidth(DEFAULT_EDITOR_WIDTH))}
    >
      {dragging && <span className="editor-width-handle__value">{width} px</span>}
    </div>
  );
}
