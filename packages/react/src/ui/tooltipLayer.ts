/*
 * Плашка подсказки: показ, место и скрытие. Отдельный чанк (см. `installTooltips`): в основной бандл не входит,
 * подгружается сразу после отрисовки редактора.
 *
 * Подсказка — по-прежнему `title` в разметке компонентов: при наведении или фокусе он переезжает в `data-inkbrick-tip`
 * (системная плашка больше не появляется), доступное имя остаётся (`aria-label`, если его не было). Работает для элементов
 * внутри документа и интерфейса редактора (`data-inkbrick-root`, `data-inkbrick-ui`, `data-inkbrick-block-ui`).
 */

const SCOPE = '[data-inkbrick-root], [data-inkbrick-ui], [data-inkbrick-block-ui]';
const TIPPED = '[title], [data-inkbrick-tip]';

/** Текст подсказки элемента; `title` при этом переезжает в `data-inkbrick-tip`, чтобы браузер не рисовал свою. */
function tipOf(element: HTMLElement): string {
  const title = element.getAttribute('title');

  if (title !== null) {
    element.removeAttribute('title');

    if (title) {
      element.dataset.inkbrickTip = title;

      // Доступное имя не теряется: у кнопки без своего имени и текста им становится подсказка.
      if (
        !element.hasAttribute('aria-label') &&
        !element.hasAttribute('aria-labelledby') &&
        !element.textContent?.trim()
      ) {
        element.setAttribute('aria-label', title);
      }
    } else {
      delete element.dataset.inkbrickTip;
    }
  }

  return element.dataset.inkbrickTip ?? '';
}

function targetOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;

  const element = node.closest<HTMLElement>(TIPPED);

  return element?.closest(SCOPE) ? element : null;
}

/** Задержка перед показом при наведении мышью. С клавиатуры подсказка появляется сразу. */
const DELAY_MS = 450;
/** После только что закрытой подсказки следующая появляется сразу: так проводят по ряду кнопок. */
const WARM_MS = 600;
const GAP = 6;
const EDGE = 4;

/** Подключает подсказки на странице; возвращает отмену. */
export function install(): () => void {
  let bubble: HTMLDivElement | null = null;
  let current: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closedAt = 0;

  const place = (target: HTMLElement) => {
    if (!bubble) return;

    const box = target.getBoundingClientRect();
    const own = bubble.getBoundingClientRect();
    const width = globalThis.innerWidth || document.documentElement.clientWidth;
    const above = box.top - own.height - GAP;
    const top = above >= EDGE ? above : box.bottom + GAP;
    const left = Math.min(
      Math.max(EDGE, box.left + box.width / 2 - own.width / 2),
      width - own.width - EDGE,
    );

    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.left = `${Math.round(left)}px`;
  };

  const show = (target: HTMLElement) => {
    const text = tipOf(target);

    if (!text || !target.isConnected) return;

    current = target;
    bubble ??= document.createElement('div');
    bubble.setAttribute('data-inkbrick-ui', 'tooltip');
    bubble.setAttribute('role', 'tooltip');
    bubble.setAttribute('aria-hidden', 'true');
    bubble.textContent = text;
    bubble.removeAttribute('data-state');
    // Рядом с ближайшей темой: плашка берёт её цвета, даже если тема задана не на всей странице.
    (target.closest('[data-inkbrick-theme]') ?? document.body).appendChild(bubble);
    place(target);
    // Следующий кадр: появление анимируется переходом прозрачности.
    requestAnimationFrame(() => {
      if (current === target) bubble?.setAttribute('data-state', 'open');
    });
  };

  const hide = () => {
    clearTimeout(timer);
    timer = undefined;

    if (current) closedAt = Date.now();

    current = null;
    bubble?.remove();
    bubble?.removeAttribute('data-state');
  };

  const schedule = (target: HTMLElement, delay: number) => {
    clearTimeout(timer);

    if (delay <= 0) show(target);
    else timer = setTimeout(() => show(target), delay);
  };

  const onOver = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;

    const target = targetOf(event.target);

    if (!target || target === current) return;

    // Системная подсказка не должна успеть появиться: `title` убирается сразу, показ — после задержки.
    if (!tipOf(target)) return;

    const warm = current !== null || Date.now() - closedAt < WARM_MS;

    hide();
    schedule(target, warm ? 0 : DELAY_MS);
  };

  const onOut = (event: PointerEvent) => {
    const target = targetOf(event.target);

    if (!target) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;

    hide();
  };

  const onFocus = (event: FocusEvent) => {
    const target = targetOf(event.target);

    if (target && target.matches(':focus-visible')) schedule(target, 0);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || current) hide();
  };

  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('pointerout', onOut, true);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('focusout', hide, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);

  return () => {
    hide();
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('pointerout', onOut, true);
    document.removeEventListener('pointerdown', hide, true);
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('focusout', hide, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('blur', hide);
  };
}
