import { useEffect, useState } from 'react';

/** Телефон: основной указатель — палец, а окно узкое. На планшете и в окне побольше меню остаются окошками у места касания. */
const QUERY = '(pointer: coarse) and (max-width: 720px)';

const matches = () => typeof matchMedia === 'function' && matchMedia(QUERY).matches;

/**
 * Меню на телефоне открываются листом снизу экрана, как в Notion: окошко у пальца закрывало бы то, с чем работают
 * (таблицу), и вылезало за край. `inset` — на сколько экранная клавиатура поднимает низ видимой области: лист стоит над ней.
 */
export function useSheet(): { sheet: boolean; inset: number } {
  const [sheet, setSheet] = useState(matches);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;

    const query = matchMedia(QUERY);
    const change = () => setSheet(query.matches);

    query.addEventListener('change', change);

    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;

    if (!sheet || !viewport) return;

    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [sheet]);

  return { sheet, inset: sheet ? inset : 0 };
}

/**
 * Лист открылся, а в документе стоит курсор: экранная клавиатура осталась бы поднятой и закрыла бы половину листа.
 * Фокус уходит из текста, клавиатура прячется; выделение ячеек и позиция курсора в модели остаются.
 */
export function hideKeyboard(): void {
  const active = typeof document === 'undefined' ? null : document.activeElement;

  if (
    active instanceof HTMLElement &&
    (active.isContentEditable ||
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement) &&
    !active.closest('[data-inkbrick-ui]')
  ) {
    active.blur();
  }
}
