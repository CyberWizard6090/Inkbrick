import { useEffect, useRef, useState, type ReactNode } from 'react';

interface DropdownProps {
  testId: string;
  label: string;
  role?: 'menu' | 'group';
  className?: string;
  width?: number;
  children(close: () => void): ReactNode;
}

/**
 * Кнопка с выпадающим списком. Список position: fixed, потому что навигация на телефоне прокручивается и
 * обрезала бы обычный выпадающий список; закрывается по Esc, клику снаружи и изменению размера окна.
 */
export function Dropdown({
  testId,
  label,
  role = 'menu',
  className = '',
  width = 240,
  children,
}: DropdownProps) {
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const close = () => setPosition(null);

  const toggle = () => {
    if (position) return close();

    const rect = button.current!.getBoundingClientRect();

    setPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  };

  useEffect(() => {
    if (!position) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (list.current?.contains(event.target) || button.current?.contains(event.target))
      )
        return;

      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={position ? 'is-active' : ''}
        data-testid={testId}
        aria-haspopup={role === 'menu' ? 'menu' : 'true'}
        aria-expanded={position !== null}
        onClick={toggle}
      >
        {label} ▾
      </button>
      {position && (
        <div
          ref={list}
          className={`tools-menu ${className}`.trim()}
          role={role}
          aria-label={role === 'group' ? label : undefined}
          data-testid={`${testId}-list`}
          style={{ ...position, width }}
        >
          {children(close)}
        </div>
      )}
    </>
  );
}
