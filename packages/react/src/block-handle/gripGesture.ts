import type { BlockDragApi } from './blockDrag';

/** Сколько пикселей мышью нужно протянуть, чтобы клик стал переносом. */
export const DRAG_THRESHOLD = 5;
/** Сколько держать палец на хваталке, чтобы начать перенос. */
export const LONG_PRESS_MS = 350;
/** Дрожание пальца, которое ещё не считается движением до начала переноса. */
export const TOUCH_SLOP = 10;

export interface GripGestureOptions {
  readonly onTap: () => void;
}

/**
 * Встроенный жест хваталки поверх публичного API переноса.
 * Мышь: протягивание дальше порога — перенос, иначе клик. Палец и перо: долгое нажатие — перенос,
 * короткое касание — клик, сдвиг до долгого нажатия отменяет жест. Возвращает функцию отмены.
 */
export function startGripGesture(
  drag: BlockDragApi,
  blockId: string,
  event: PointerEvent,
  { onTap }: GripGestureOptions,
): () => void {
  const touch = event.pointerType === 'touch' || event.pointerType === 'pen';
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let aborted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const begin = () => {
    if (dragging || aborted) return;

    dragging = true;
    drag.start(blockId);

    if (touch) navigator.vibrate?.(10);
  };

  const finish = () => {
    clearTimeout(timer);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);
  };

  const onMove = (move: PointerEvent) => {
    if (move.pointerId !== pointerId) return;

    const distance = Math.hypot(move.clientX - startX, move.clientY - startY);

    if (!dragging) {
      if (touch) {
        if (distance > TOUCH_SLOP) {
          aborted = true;
          finish();
        }

        return;
      }

      if (distance > DRAG_THRESHOLD) begin();
    }

    if (dragging) {
      move.preventDefault();
      drag.update(move.clientX, move.clientY);
    }
  };

  const onUp = (up: PointerEvent) => {
    if (up.pointerId !== pointerId) return;

    finish();

    if (dragging) drag.drop();
    else if (!aborted) onTap();
  };

  const onCancel = (cancel: PointerEvent) => {
    if (cancel.pointerId !== pointerId) return;

    abort();
  };

  const onKey = (key: KeyboardEvent) => {
    if (key.key === 'Escape') abort();
  };

  const abort = () => {
    aborted = true;
    finish();

    if (dragging) drag.cancel();
  };

  if (touch) timer = setTimeout(begin, LONG_PRESS_MS);

  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey);

  return abort;
}
