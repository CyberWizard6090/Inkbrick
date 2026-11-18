import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { BaseBlock, TableColumnType, TableOption } from '@inkbrick/document';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import {
  columnHref,
  isChecked,
  isLinkType,
  isSelectType,
  optionOf,
  parseSelected,
  serializeSelected,
} from './columnTypes';

const textOf = (block: BaseBlock) => block.content.map((node) => node.insert).join('');

/** Заменяет весь текст ячейки: одна правка, один шаг undo. */
function useSetCellText(block: BaseBlock) {
  const editor = useEditor();

  return (text: string) =>
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: block.id, from: 0, to: textOf(block).length, text },
    });
}

/** Флажок вместо текста ячейки: клик и пробел переключают `true` и пусто. */
export function CheckboxControl({ block, readOnly }: { block: BaseBlock; readOnly: boolean }) {
  const t = useT();
  const set = useSetCellText(block);
  const checked = isChecked(textOf(block));

  return (
    <input
      type="checkbox"
      data-inkbrick-part="cell-checkbox"
      checked={checked}
      disabled={readOnly}
      aria-label={t('table.cell.checkbox')}
      onChange={() => set(checked ? '' : 'true')}
    />
  );
}

/** Адрес ячейки со ссылкой, email или телефоном: открывается в новой вкладке, неверное значение помечено. */
export function LinkControl({ block, type }: { block: BaseBlock; type: TableColumnType }) {
  const t = useT();
  const text = textOf(block);
  const href = columnHref(type, text);

  if (!isLinkType(type) || text.trim() === '') return null;

  return href ? (
    <a
      data-inkbrick-part="cell-link"
      href={href}
      target={type === 'url' ? '_blank' : undefined}
      rel="noopener noreferrer"
      contentEditable={false}
      aria-label={t(`table.cell.open.${type}`)}
      title={t(`table.cell.open.${type}`)}
    >
      <Icon name="link" />
    </a>
  ) : (
    <span
      data-inkbrick-part="cell-invalid"
      contentEditable={false}
      role="img"
      aria-label={t(`table.cell.invalid.${type}`)}
      title={t(`table.cell.invalid.${type}`)}
    >
      !
    </span>
  );
}

/** Цветные метки выбранных вариантов вместо текста ячейки. */
export function ChipsControl({
  block,
  options,
  readOnly,
  multiple,
}: {
  block: BaseBlock;
  options: readonly TableOption[] | null | undefined;
  readOnly: boolean;
  multiple: boolean;
}) {
  const t = useT();
  const view = useEditorView();
  const set = useSetCellText(block);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const selected = parseSelected(textOf(block));
  const id = useId();
  // После выбора фокус возвращается в ячейку: Ctrl+Z и клавиши таблицы работают сразу.
  const editor = useEditor();
  const backToCell = () => {
    const fresh = editor.store.getBlock(block.id);

    if (fresh) view.placeCaret(block.id, textOf(fresh).length);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        data-inkbrick-part="cell-chips"
        disabled={readOnly}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={t('table.cell.choose')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {selected.map((label) => {
          const option = optionOf(options, label);

          return (
            <span key={label} data-inkbrick-part="chip" data-color={option.color ?? 'gray'}>
              {label}
            </span>
          );
        })}
        {selected.length === 0 && <span data-inkbrick-part="chip-empty">{' '}</span>}
      </button>
      {open && !readOnly && (
        <OptionsPicker
          id={id}
          multiple={multiple}
          anchor={button.current}
          options={options ?? []}
          selected={selected}
          onPick={(label) => {
            const next = multiple
              ? selected.includes(label)
                ? selected.filter((value) => value !== label)
                : [...selected, label]
              : selected.includes(label)
                ? []
                : [label];

            set(serializeSelected(next));
            if (!multiple) {
              setOpen(false);
              backToCell();
            }
          }}
          onClear={() => {
            set('');
            setOpen(false);
            backToCell();
          }}
          onClose={() => setOpen(false)}
          onEscape={() => {
            setOpen(false);
            backToCell();
          }}
        />
      )}
    </>
  );
}

function OptionsPicker({
  id,
  multiple,
  anchor,
  options,
  selected,
  onPick,
  onClear,
  onClose,
  onEscape,
}: {
  id: string;
  multiple: boolean;
  anchor: HTMLElement | null;
  options: readonly TableOption[];
  selected: readonly string[];
  onPick: (label: string) => void;
  onClear: () => void;
  onClose: () => void;
  onEscape: () => void;
}) {
  const t = useT();
  const list = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const rect = anchor?.getBoundingClientRect();

  useEffect(() => {
    list.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!list.current?.contains(target) && !anchor?.contains(target)) onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);

    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchor, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={list}
      id={id}
      data-inkbrick-ui="options-picker"
      role="listbox"
      aria-multiselectable={multiple || undefined}
      aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
      aria-label={t('table.cell.choose')}
      tabIndex={-1}
      style={{ position: 'fixed', left: rect?.left ?? 0, top: (rect?.bottom ?? 0) + 2 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onEscape();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setActive((index) =>
            options.length
              ? (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
              : 0,
          );
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (options[active]) onPick(options[active].label);
        }
      }}
    >
      {options.length === 0 && <div data-inkbrick-part="empty">{t('table.cell.noOptions')}</div>}
      {options.map((option, index) => (
        <div
          key={option.label}
          id={`${id}-${index}`}
          role="option"
          aria-selected={selected.includes(option.label)}
          data-inkbrick-part="option"
          data-active={index === active || undefined}
          onMouseEnter={() => setActive(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(option.label)}
        >
          <span data-inkbrick-part="chip" data-color={option.color ?? 'gray'}>
            {option.label}
          </span>
          {selected.includes(option.label) && <Icon name="check" />}
        </div>
      ))}
      {selected.length > 0 && (
        <div
          role="button"
          tabIndex={-1}
          data-inkbrick-part="clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          {t('table.cell.clear')}
        </div>
      )}
    </div>,
    document.body,
  );
}

export { isSelectType };
