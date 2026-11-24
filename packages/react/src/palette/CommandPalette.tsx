import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useSheet } from '../hooks/useSheet';
import { useReadOnly } from '../hooks/useReadOnly';
import { PortalPresence } from '../ui/Presence';
import { useT } from '../hooks/useT';
import { useEditorUI } from '../ui/EditorUIContext';
import { builtinCommands, formatShortcut } from './builtin';
import { filterCommands, groupCommands } from './filter';
import { getPaletteController } from './PaletteController';
import {
  resolveCommand,
  type PaletteCommand,
  type PaletteContext,
  type ResolvedPaletteCommand,
} from './types';

export interface CommandPaletteProps {
  /** Свои команды приложения; с тем же `id`, что у встроенной, заменяют её. */
  readonly commands?: readonly PaletteCommand[];
  /** `false` убирает встроенные команды (история, форматирование, превращение и вставка блоков). */
  readonly builtin?: boolean;
}

/**
 * Палитра команд: окно с поиском по всем действиям редактора и приложения. Открывают её Ctrl/Cmd+Shift+P (из
 * `commandPalette.keymap`) или `useCommandPalette().open()`; стрелки выбирают, Enter выполняет, Esc закрывает.
 */
export function CommandPalette({ commands = [], builtin = true }: CommandPaletteProps) {
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  // Телефон: палитра — лист снизу над экранной клавиатурой.
  const { sheet, inset } = useSheet();
  const readOnly = useReadOnly();
  const { slashItems } = useEditorUI();
  const controller = getPaletteController(view);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const { open, nonce, selection } = state;

  const context: PaletteContext = useMemo(
    () => ({ editor, view, t, readOnly, selection }),
    [editor, view, t, readOnly, selection],
  );

  // Список пересчитывается при каждом открытии: он зависит от текущего блока и выделения.
  const available = useMemo(() => {
    if (!open) return [];

    const own = builtin ? builtinCommands(slashItems, t) : [];
    const replaced = new Set(commands.map((command) => command.id));
    const all = [...commands, ...own.filter((command) => !replaced.has(command.id))];

    return all
      .filter((command) => command.when?.(context) !== false)
      .map((command) => resolveCommand(command, t));
    // `nonce` — новое открытие, `context` — выделение на момент открытия.
  }, [open, nonce, builtin, commands, slashItems, t, context]);

  const visible = useMemo(
    () => (query.trim() === '' ? groupCommands(available) : filterCommands(available, query)),
    [available, query],
  );

  useLayoutEffect(() => {
    if (!open) return;

    view.panels.add('palette');

    return () => void view.panels.delete('palette');
  }, [open, view]);

  // Фокус переносится до отрисовки: нажатия сразу после появления окна попадают в строку поиска, а не в документ.
  useLayoutEffect(() => {
    if (!open) return;

    setQuery('');
    setActive(0);
    input.current?.focus();
  }, [open, nonce]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, visible]);

  // Закрытие вместе с редактором.
  useEffect(() => () => controller.close(), [controller]);

  const optionId = (index: number) => `${id}-option-${index}`;
  const other = t('slash.group.other');

  const run = (command: ResolvedPaletteCommand) => {
    controller.closeAndRestore();
    command.run(context);
  };

  return (
    <PortalPresence
      open={open}
      render={() => (
        <div
          data-inkbrick-ui="palette-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) controller.closeAndRestore();
          }}
        >
          <div
            data-inkbrick-ui="palette"
            data-testid="command-palette"
            data-sheet={sheet || undefined}
            style={
              sheet
                ? ({ bottom: inset, '--inkbrick-keyboard': `${inset}px` } as CSSProperties)
                : undefined
            }
            role="dialog"
            aria-modal="true"
            aria-label={t('palette.label')}
          >
            <input
              ref={input}
              data-inkbrick-part="query"
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={visible.length > 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              value={query}
              placeholder={t('palette.placeholder')}
              aria-label={t('palette.placeholder')}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;

                switch (event.key) {
                  case 'ArrowDown':
                    event.preventDefault();
                    setActive((index) => (visible.length ? (index + 1) % visible.length : 0));
                    break;
                  case 'ArrowUp':
                    event.preventDefault();
                    setActive((index) =>
                      visible.length ? (index - 1 + visible.length) % visible.length : 0,
                    );
                    break;
                  case 'Home':
                    if (query === '') {
                      event.preventDefault();
                      setActive(0);
                    }
                    break;
                  case 'End':
                    if (query === '') {
                      event.preventDefault();
                      setActive(Math.max(0, visible.length - 1));
                    }
                    break;
                  case 'Enter':
                    event.preventDefault();
                    if (visible[active]) run(visible[active]);
                    break;
                  case 'Escape':
                    event.preventDefault();
                    event.stopPropagation();
                    controller.closeAndRestore();
                    break;
                  case 'Tab':
                    // Фокус остаётся в окне.
                    event.preventDefault();
                    break;
                }
              }}
            />
            <div
              ref={list}
              id={`${id}-list`}
              data-inkbrick-part="list"
              role="listbox"
              aria-label={t('palette.label')}
            >
              {visible.length === 0 && (
                <div data-inkbrick-part="empty" role="presentation">
                  {t('palette.empty')}
                </div>
              )}
              {visible.map((command, index) => {
                const group = query.trim() === '' ? (command.group ?? other) : undefined;
                const previous = index > 0 ? visible[index - 1] : undefined;
                const header =
                  group !== undefined && (!previous || (previous.group ?? other) !== group);

                return (
                  <div key={command.id} role="presentation">
                    {header && (
                      <div data-inkbrick-part="group" role="presentation">
                        {group}
                      </div>
                    )}
                    <div
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      data-inkbrick-part="option"
                      data-command={command.id}
                      onMouseMove={() => setActive(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => run(command)}
                    >
                      {command.icon && <span data-inkbrick-part="icon">{command.icon}</span>}
                      <span data-inkbrick-part="title">
                        {command.title}
                        {command.description && (
                          <span data-inkbrick-part="description">{command.description}</span>
                        )}
                      </span>
                      {command.shortcut && (
                        <kbd data-inkbrick-part="shortcut">{formatShortcut(command.shortcut)}</kbd>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    />
  );
}
