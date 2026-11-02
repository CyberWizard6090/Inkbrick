import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../icons/Icon';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly label: string;
  readonly part: string;
  readonly className?: string;
  readonly disabled?: boolean;
  onChange(value: string): void;
}

interface Placement {
  readonly top: number;
  readonly left: number;
  readonly minWidth: number;
  readonly side: 'bottom' | 'top';
}

const GAP = 4;
const MARGIN = 8;

const stop = (event: SyntheticEvent) => event.stopPropagation();

export function Select({
  value,
  options,
  label,
  part,
  className,
  disabled,
  onChange,
}: SelectProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState(0);
  const open = placement !== null;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const current = options[selectedIndex];

  const close = (refocus: boolean) => {
    setPlacement(null);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };

  const show = () => {
    const rect = trigger.current!.getBoundingClientRect();

    setActive(Math.max(selectedIndex, 0));
    setPlacement({
      top: rect.bottom + GAP,
      left: Math.max(MARGIN, rect.left),
      minWidth: rect.width,
      side: 'bottom',
    });
  };

  const choose = (index: number) => {
    const option = options[index];

    close(true);
    if (option && option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    if (!placement || !list.current) return;

    const rect = list.current.getBoundingClientRect();
    const anchor = trigger.current!.getBoundingClientRect();
    const fitsBelow = anchor.bottom + GAP + rect.height <= window.innerHeight - MARGIN;
    const side = fitsBelow || anchor.top - GAP - rect.height < MARGIN ? 'bottom' : 'top';
    const top = side === 'bottom' ? anchor.bottom + GAP : anchor.top - GAP - rect.height;
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - rect.width - MARGIN));

    if (side !== placement.side || top !== placement.top || left !== placement.left) {
      setPlacement({ ...placement, top, left, side });
    }
  }, [placement]);

  useEffect(() => {
    if (!open) return;

    list.current?.focus({ preventScroll: true });

    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (list.current?.contains(target) || trigger.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) close(false);
    };
    const onScroll = (event: Event) => {
      if (!inside(event.target)) close(false);
    };
    const onResize = () => close(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    const element = list.current;
    const option = document.getElementById(`${id}-${active}`);

    if (!open || !element || !option) return;

    if (option.offsetTop < element.scrollTop) element.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > element.scrollTop + element.clientHeight) {
      element.scrollTop = option.offsetTop + option.offsetHeight - element.clientHeight;
    }
  }, [open, active, id]);

  const onListKeyDown = (event: ReactKeyboardEvent) => {
    event.stopPropagation();

    const last = options.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => Math.min(index + 1, last));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const key = event.key.toLowerCase();
          const next = options.findIndex(
            (option, index) => index > active && option.label.toLowerCase().startsWith(key),
          );
          const found =
            next !== -1
              ? next
              : options.findIndex((option) => option.label.toLowerCase().startsWith(key));

          if (found !== -1) setActive(found);
        }
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        data-inkbrick-part={part}
        data-value={value}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          event.stopPropagation();

          if (open) {
            onListKeyDown(event);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <span data-inkbrick-part="select-value">{current?.label ?? value}</span>
        <Icon name="chevron-down" data-inkbrick-part="select-chevron" />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            data-inkbrick-ui="select"
            data-side={placement.side}
            style={{ top: placement.top, left: placement.left, minWidth: placement.minWidth }}
            onKeyDown={onListKeyDown}
            onPointerDown={stop}
            onMouseDown={stop}
            onClick={stop}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-inkbrick-part="option"
                data-value={option.value}
                data-active={index === active || undefined}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span data-inkbrick-part="option-label">{option.label}</span>
                {option.value === value && <Icon name="check" data-inkbrick-part="option-check" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
