import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Есть ли у элемента сейчас CSS-анимация, которую стоит дождаться. */
function animates(element: Element): boolean {
  const style = getComputedStyle(element);

  return (
    style.animationName !== '' &&
    style.animationName !== 'none' &&
    style.animationDuration.split(',').some((part) => parseFloat(part) > 0)
  );
}

/** Сколько миллисекунд длится самая долгая анимация элемента (с задержкой). */
function animationTime(element: Element): number {
  const style = getComputedStyle(element);
  const seconds = (value: string) => value.split(',').map((part) => parseFloat(part) || 0);
  const durations = seconds(style.animationDuration);
  const delays = seconds(style.animationDelay);

  return (
    Math.max(...durations.map((duration, i) => duration + (delays[i % delays.length] ?? 0))) * 1000
  );
}

export interface PresenceProps {
  /** Показывать ли содержимое. После `false` оно остаётся на экране, пока идёт его анимация выхода. */
  readonly open: boolean;
  /** Содержимое. Вызывается, только пока `open`; на время выхода показывается то, что было нарисовано в последний раз. */
  readonly render: () => ReactNode;
  /**
   * Что делать, если окно открыли снова, пока оно ещё уходит. По умолчанию содержимое создаётся заново: так срабатывают
   * все эффекты при монтировании (фокус в списке, слушатели) и снова играет анимация появления. `reuse` оставляет тот же
   * узел и его состояние: годится для простых окон без эффектов, например ручки блока, которая не должна мигать.
   */
  readonly reuse?: boolean;
}

/**
 * Плавное исчезновение: когда `open` становится `false`, содержимое не удаляется сразу, а получает на обёртке
 * `data-state="closed"` и уходит CSS-анимацией (`@layer inkbrick.ui`, `--inkbrick-disappear-duration`). Удаляется оно,
 * когда анимация закончилась. Если у содержимого анимации нет (нет стилей пакета, `prefers-reduced-motion`,
 * `--inkbrick-disappear-duration: 0ms`, свой компонент из слота), оно удаляется сразу, как без `Presence`.
 * Повторное открытие во время выхода по умолчанию создаёт содержимое заново (`reuse` оставляет тот же узел).
 *
 * Обёртка `data-inkbrick-presence` — `display: contents`: на раскладку она не влияет.
 */
export function Presence({ open, render, reuse = false }: PresenceProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const last = useRef<ReactNode>(null);
  const [finished, setFinished] = useState(false);
  const wasOpen = useRef(false);
  const generation = useRef(0);

  if (open) {
    last.current = render();
    // Повторное открытие: без `reuse` у содержимого новый ключ, и оно монтируется заново.
    if (!wasOpen.current && !reuse) generation.current++;
  }

  wasOpen.current = open;

  // Новое открытие отменяет выход, который уже закончился: следующее закрытие снова будет выходом.
  useLayoutEffect(() => {
    if (open && finished) setFinished(false);
  }, [open, finished]);

  useLayoutEffect(() => {
    if (open || finished || last.current === null) return;

    const element = wrapper.current?.firstElementChild;
    const done = () => {
      last.current = null;
      setFinished(true);
    };

    if (!element || !animates(element)) {
      done();
      return;
    }

    // Только события анимации выхода: если окно закрылось, пока ещё шло его появление, браузер сначала отменяет эту
    // анимацию (`animationcancel`), и принять её за конец выхода нельзя.
    const exit = getComputedStyle(element).animationName.split(',')[0].trim();
    const onEnd = (event: Event) => {
      if (event.target === element && (event as AnimationEvent).animationName === exit) done();
    };

    element.addEventListener('animationend', onEnd);
    element.addEventListener('animationcancel', onEnd);
    // Если событие не придёт (вкладка в фоне, анимацию отменили), содержимое всё равно уберётся.
    const timer = setTimeout(done, animationTime(element) + 100);

    return () => {
      element.removeEventListener('animationend', onEnd);
      element.removeEventListener('animationcancel', onEnd);
      clearTimeout(timer);
    };
  }, [open, finished]);

  if (!open && (finished || last.current === null)) return null;

  return (
    <div
      ref={wrapper}
      data-inkbrick-presence=""
      data-state={open ? 'open' : 'closed'}
      aria-hidden={open ? undefined : true}
    >
      <Fragment key={generation.current}>{last.current}</Fragment>
    </div>
  );
}

/** `Presence` в `document.body`: для всплывающих окон, которые рисуются поверх страницы. */
export function PortalPresence(props: PresenceProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(<Presence {...props} />, document.body);
}
