import { getBlockAlign, getBlockBackground } from '@inkbrick/document';

import { Editable } from '../blocks/Editable';
import type { BlockProps } from '../blocks/BlockProps';
import { useEditor } from '../hooks/useEditor';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { useFoldTracking } from './useFoldTracking';

/**
 * Заголовок со стрелкой: нажатие сворачивает всё до следующего заголовка того же или более высокого уровня, повторное —
 * разворачивает. Состояние (`collapsed`) хранится в документе и входит в историю правок.
 */
export function FoldableHeadingBlock({ block, selected }: BlockProps) {
  const editor = useEditor();
  const t = useT();

  useFoldTracking();

  const level = typeof block.props.level === 'number' ? block.props.level : 1;
  const align = getBlockAlign(block) ?? 'left';
  const collapsed = block.props.collapsed === true;

  const toggle = () =>
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: block.id, props: { collapsed: !collapsed } },
    });

  return (
    <div
      className={`block block-heading level-${level}`}
      data-inkbrick-block="heading"
      data-level={level}
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-align={align}
      data-background={getBlockBackground(block)}
      data-foldable=""
      data-collapsed={collapsed || undefined}
    >
      <Editable block={block} />
      {/* Стрелка стоит после текста: слева полосу занимает ручка блока, а перед текстом стрелка сдвигала бы заголовок. */}
      <button
        type="button"
        contentEditable={false}
        data-inkbrick-part="fold"
        aria-expanded={!collapsed}
        aria-label={t(collapsed ? 'fold.expand' : 'fold.collapse')}
        title={t(collapsed ? 'fold.expand' : 'fold.collapse')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        <Icon name="chevron-down" />
      </button>
    </div>
  );
}
