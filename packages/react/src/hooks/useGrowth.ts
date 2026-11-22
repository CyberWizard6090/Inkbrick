import { useEffect, useState, type RefObject } from 'react';

/**
 * Счётчик изменений высоты элемента: меняется, когда элемент вырос или сжался (например, в меню раскрылся выбор цвета).
 * Положите его в зависимости эффекта, который ставит всплывающее окно в пределы экрана, — окно не уйдёт за край.
 */
export function useGrowth(ref: RefObject<HTMLElement | null>, enabled = true): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element || !enabled || typeof ResizeObserver !== 'function') return;

    let height = element.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (Math.abs(element.offsetHeight - height) < 1) return;

      height = element.offsetHeight;
      setCount((value) => value + 1);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, enabled]);

  return count;
}
