import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import type { BaseBlock } from '@inkbrick/document';

import { renderCode } from '../editing/renderCode';
import { renderInline } from '../editing/renderInline';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useT } from '../hooks/useT';
import { useEditorUI } from '../ui/EditorUIContext';

export interface EditableProps {
  readonly block: BaseBlock;
  /**
   * Собственная подсказка пустого блока (показывается всегда, пока блок пуст). Не нужна: по умолчанию редактор
   * сам показывает одну общую подсказку («Нажмите / …») в пустом блоке, где стоит каретка.
   */
  readonly placeholder?: string;
}

/**
 * Текст блока. Сам по себе не является contenteditable: редактируемым элементом
 * служит корень `<DocumentView>`, благодаря чему выделение может охватывать несколько блоков.
 * Содержимое рисуется из `block.content`, а ввод обрабатывается корнем через движок.
 *
 * Атрибуты для стилизации: `data-empty`, `data-focused` (каретка в этом блоке), `data-hint` (текст общей
 * подсказки; есть только там, где работает slash-меню), `data-placeholder` (своя подсказка, если задана).
 */
export function Editable({ block, placeholder }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useEditorView();
  const t = useT();
  const readOnly = useReadOnly();
  const { slashItems, highlighter, formulaRenderer } = useEditorUI();
  const focused = useSyncExternalStore(
    view.caret.subscribe,
    () => view.caret.has(block.id),
    () => false,
  );

  useLayoutEffect(() => view.register(block.id, ref.current!), [view, block.id]);

  const isCode = block.flavour === 'block:code';
  const language = typeof block.props.language === 'string' ? block.props.language : 'plain';

  useLayoutEffect(() => {
    const plain = block.content.every((node) => !node.attributes);

    // Код — простой текст: подсветка только оборачивает его в <span data-inkbrick-token>, не меняя символов.
    if (isCode && highlighter && plain) {
      const text = block.content.map((node) => node.insert).join('');
      let tokens: ReturnType<typeof highlighter> = [];

      try {
        tokens = highlighter(text, language);
      } catch (error) {
        // Ошибка подсветчика (в том числе чужого) не должна ронять редактор: показываем текст без подсветки.
        console.error('[@inkbrick/react] The code highlighter failed:', error);
      }

      renderCode(ref.current!, text, tokens);
    } else {
      renderInline(ref.current!, block.content, { formulaRenderer });
    }
  }, [block.content, isCode, language, highlighter, formulaRenderer]);

  const isEmpty = block.content.every((node) => node.insert.length === 0);

  // Подсказка про «/» уместна там, где меню открывается: не в режиме чтения, не в коде и если меню не отключено.
  const hinted = !readOnly && slashItems.length > 0 && block.flavour !== 'block:code';

  return (
    <div
      ref={ref}
      className="editable"
      data-inkbrick-part="content"
      data-id={block.id}
      data-empty={isEmpty}
      data-focused={focused || undefined}
      data-hint={hinted ? t('editor.hint') : undefined}
      data-placeholder={placeholder}
    />
  );
}
