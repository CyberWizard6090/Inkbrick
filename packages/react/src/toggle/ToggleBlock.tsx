import { useState } from 'react';

import { getBlockAlign } from '@inkbrick/document';
import { backgroundAttrs } from '../blocks/backgroundAttrs';

import { BlockChildren } from '../blocks/BlockChildren';
import { Editable } from '../blocks/Editable';
import type { BlockProps } from '../blocks/BlockProps';
import { useChildren } from '../hooks/useChildren';
import { useEditor } from '../hooks/useEditor';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { useCollapse } from '../ui/collapse';

/**
 * Переключатель: стрелка и строка заголовка; вложенные блоки видны, только пока блок раскрыт. Состояние (`open`) хранится
 * в документе и входит в историю правок; в режиме только чтения — только на экране. У закрытого блока без вложенных блоков стрелка остаётся — Enter в конце
 * строки создаёт первый вложенный.
 */
export function ToggleBlock({ block, selected, readOnly }: BlockProps) {
  const editor = useEditor();
  const t = useT();
  const children = useChildren(block.id);

  // Читатель документа раскрывает блок для себя: в только чтении документ не меняется, состояние локальное.
  const [local, setLocal] = useState<boolean | null>(null);
  const open = readOnly && local !== null ? local : block.props.open !== false;
  const label = t(open ? 'fold.collapse' : 'fold.expand');
  // Вложенные блоки раскрываются и сворачиваются плавно: пока они уходят, остаются в дереве.
  // Анимируется только сворачивание и разворачивание: первый вложенный блок (Enter в заголовке) появляется сразу.
  const nested = useCollapse<HTMLDivElement>(open);

  const toggle = () => {
    if (readOnly) setLocal(!open);
    else {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: block.id, props: { open: !open } },
      });
    }
  };

  return (
    <div
      className="block-toggle"
      data-inkbrick-block="toggle"
      data-block-id={block.id}
      data-align={getBlockAlign(block) ?? 'left'}
      {...backgroundAttrs(block)}
      data-open={open || undefined}
      data-selected={selected || undefined}
    >
      <div className="block" data-inkbrick-part="row">
        <button
          type="button"
          contentEditable={false}
          data-inkbrick-part="toggle"
          aria-expanded={open}
          aria-label={label}
          title={label}
          disabled={children.length === 0 && readOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
        >
          <Icon name="chevron-down" />
        </button>
        <Editable block={block} />
      </div>

      {nested.mounted && children.length > 0 && (
        <div ref={nested.ref} className="block-nested-children" data-inkbrick-part="children">
          <BlockChildren id={block.id} />
        </div>
      )}
    </div>
  );
}
