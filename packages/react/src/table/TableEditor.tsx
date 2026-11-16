import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import {
  createTableEditor,
  tableValue,
  type Editor,
  type TableEditorOptions,
  type TableValue,
} from '@inkbrick/engine';

import { EditorProvider, type EditorProviderProps } from '../context/EditorProvider';
import { DocumentView, type DocumentViewProps } from '../renderer/DocumentView';
import type { EditorSlots } from '../ui/types';
import { tableBlocks } from './index';

export interface TableEditorProps
  extends
    TableEditorOptions,
    Pick<
      EditorProviderProps,
      | 'locale'
      | 'locales'
      | 'messages'
      | 'readOnly'
      | 'formatting'
      | 'presentation'
      | 'keymap'
      | 'highlighter'
      | 'formulaRenderer'
    >,
    Pick<DocumentViewProps, 'label'> {
  /**
   * Свой редактор из `createTableEditor` — чтобы читать и менять таблицу из кода. Тогда `rows`, `header` и `widths`
   * не используются: начальное содержимое задано при создании. Без него редактор создаётся один раз.
   */
  readonly editor?: Editor;
  /** Вызывается после каждой правки (и undo/redo) с текущим содержимым. */
  readonly onChange?: (value: TableValue) => void;
  /**
   * Задержка `onChange` в миллисекундах: значение собирается и отдаётся один раз после паузы в правках, а не на
   * каждое нажатие клавиши (и сразу при размонтировании, если правки ещё не отданы). По умолчанию `0` — после каждой.
   */
  readonly changeDelay?: number;
  /** Класс контейнера. */
  readonly className?: string;
  readonly children?: ReactNode;
}

/** В отдельном редакторе таблицы нет ручек блока, переноса блоков и slash-меню: документ — одна таблица. */
const slots: EditorSlots = { BlockHandle: null, DropIndicator: null };

/**
 * Отдельный редактор таблицы: документ из одной закреплённой таблицы. Её нельзя удалить, превратить в другой блок
 * или покинуть стрелками и Enter; строки, столбцы, ширины, выравнивание, Tab, буфер обмена, undo и экспорт работают
 * так же, как в таблице внутри редактора документа.
 *
 * ```tsx
 * <TableEditor rows={[['Name', 'Qty'], ['Apple', '3']]} onChange={(value) => save(value.rows)} />
 * ```
 */
export function TableEditor({
  editor: given,
  rows,
  header,
  align,
  widths,
  history,
  meta,
  onChange,
  changeDelay = 0,
  className,
  label,
  children,
  ...provider
}: TableEditorProps) {
  // Начальное содержимое читается один раз: дальше таблицей владеет редактор, а не props.
  const editor = useMemo(
    () => given ?? createTableEditor({ rows, header, align, widths, history, meta }),
    [given],
  );
  const listener = useRef(onChange);

  listener.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;

    const emit = () => {
      timer = undefined;
      pending = false;
      listener.current?.(tableValue(editor));
    };

    const stop = editor.store.subscribeChanges(() => {
      if (changeDelay <= 0) return emit();

      pending = true;
      clearTimeout(timer);
      timer = setTimeout(emit, changeDelay);
    });

    return () => {
      stop();
      clearTimeout(timer);

      if (pending) emit();
    };
  }, [editor, changeDelay]);

  return (
    <div className={className} data-inkbrick-table-editor="">
      <EditorProvider
        editor={editor}
        blocks={tableBlocks}
        slots={slots}
        slashItems={false}
        {...provider}
      >
        <DocumentView label={label} />
        {children}
      </EditorProvider>
    </div>
  );
}
