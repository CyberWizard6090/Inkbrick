/**
 * Всплывающие подсказки кнопок редактора — одна оформленная плашка в цветах темы вместо системной подсказки браузера
 * (`title`). Сама плашка — в отдельном чанке (`tooltipLayer`), он подгружается сразу после отрисовки редактора.
 * Обработчик один на страницу, сколько бы редакторов на ней ни было.
 */

import { lazyModule } from './lazy';

const layer = lazyModule(() => import('./tooltipLayer'), { soon: true });

let users = 0;
let teardown: (() => void) | undefined;
let pending = false;

/** Включает подсказки на странице; возвращает отмену. */
export function installTooltips(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  users += 1;

  if (!teardown && !pending) {
    pending = true;
    void layer.preload().then(({ install }) => {
      pending = false;

      if (users > 0) teardown = install();
    });
  }

  return () => {
    users -= 1;

    if (users === 0) {
      teardown?.();
      teardown = undefined;
    }
  };
}
