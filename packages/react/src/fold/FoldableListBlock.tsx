import { useState } from 'react';
import { flushSync } from 'react-dom';

import { ListItem } from '../blocks/ListBlock';
import type { BlockProps } from '../blocks/BlockProps';
import { readDocSelection } from '../editing/selection';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';

/**
 * Пункт списка со стрелкой: нажатие прячет вложенные блоки (`collapsed` в props пункта, входит в историю правок),
 * повторное — показывает. Стрелка есть только у пункта с вложенными блоками. В режиме только чтения читатель сворачивает
 * пункт для себя: документ при этом не меняется.
 */
export function FoldableListBlock(props: BlockProps) {
  const { block, readOnly } = props;
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  const [local, setLocal] = useState<boolean | null>(null);
  const collapsed = readOnly && local !== null ? local : block.props.collapsed === true;

  const toggle = () => {
    if (readOnly) {
      setLocal(!collapsed);
      return;
    }

    const root = view.getRoot();
    const caret = root ? readDocSelection(root) : null;

    flushSync(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: block.id, props: { collapsed: !collapsed } },
      });
    });

    // Каретка во вложенном блоке, который только что скрылся, теряется: переносим её на сам пункт.
    if (
      !collapsed &&
      caret &&
      caret.from.blockId !== block.id &&
      isInside(editor, caret.from.blockId, block.id)
    ) {
      const length = editor.store
        .getBlock(block.id)!
        .content.reduce((total, node) => total + node.insert.length, 0);

      view.placeCaret(block.id, length);
    }
  };

  return (
    <ListItem
      {...props}
      fold={{
        collapsed,
        label: t(collapsed ? 'fold.listExpand' : 'fold.listCollapse'),
        toggle,
      }}
    />
  );
}

/** Лежит ли блок `id` внутри блока `ancestor`. */
function isInside(editor: ReturnType<typeof useEditor>, id: string, ancestor: string): boolean {
  for (let block = editor.store.getBlock(id); block?.parentId;) {
    if (block.parentId === ancestor) return true;

    block = editor.store.getBlock(block.parentId);
  }

  return false;
}
