/** Ширина области редактора в песочнице: тянется ручкой слева и запоминается в браузере. */

const STORAGE_KEY = 'inkbrick-sandbox-editor-width';

export const DEFAULT_EDITOR_WIDTH = 816;
export const MIN_EDITOR_WIDTH = 320;

/** Шире окна не бывает: на узком экране сохранённая ширина ужимается. */
export const maxEditorWidth = () => Math.max(MIN_EDITOR_WIDTH, window.innerWidth);

export const clampEditorWidth = (width: number) =>
  Math.round(Math.min(maxEditorWidth(), Math.max(MIN_EDITOR_WIDTH, width)));

export function initialEditorWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));

    return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_EDITOR_WIDTH;
  } catch {
    return DEFAULT_EDITOR_WIDTH;
  }
}

export function saveEditorWidth(width: number): void {
  try {
    if (width === DEFAULT_EDITOR_WIDTH) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Хранилище недоступно (приватный режим): ширина действует до перезагрузки.
  }
}
