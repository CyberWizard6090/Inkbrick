import { getBlockAlign } from '@inkbrick/document';

import { BlockChildren } from './BlockChildren';
import { useBlock } from '../hooks/useBlock';
import { useChildren } from '../hooks/useChildren';
import { useEditor } from '../hooks/useEditor';
import { useT } from '../hooks/useT';
import { Editable } from './Editable';
import type { BlockProps } from './BlockProps';

function useOrderedNumber(block: BlockProps['block']): number {
  const { store } = useEditor();
  const parent = useBlock(block.parentId ?? '');

  if (!parent) return 1;

  let number = 1;

  for (let i = parent.children.indexOf(block.id) - 1; i >= 0; i--) {
    const sibling = store.getBlock(parent.children[i]);

    if (sibling?.flavour !== 'block:list' || sibling.props.type !== 'ordered') break;

    number++;
  }

  return number;
}

export function ListBlock({ block, selected, readOnly }: BlockProps) {
  const editor = useEditor();
  const t = useT();
  const children = useChildren(block.id);
  const orderedNumber = useOrderedNumber(block);

  const type = typeof block.props.type === 'string' ? block.props.type : 'bullet';

  return (
    <div
      className="block-list-item"
      data-inkbrick-block="list"
      data-align={getBlockAlign(block) ?? 'left'}
      data-block-id={block.id}
      data-list-type={type}
      data-checked={type === 'todo' ? block.props.checked === true : undefined}
      data-selected={selected || undefined}
    >
      <div className="block block-list" data-inkbrick-part="row" data-list-type={type}>
        {type === 'todo' ? (
          <input
            className="list-marker list-checkbox"
            data-inkbrick-part="checkbox"
            type="checkbox"
            aria-label={t('block.list.done')}
            contentEditable={false}
            disabled={readOnly}
            checked={block.props.checked === true}
            onChange={(event) =>
              editor.dispatch({
                type: 'setBlockProps',
                payload: { blockId: block.id, props: { checked: event.target.checked } },
              })
            }
          />
        ) : (
          <span
            className="list-marker"
            data-inkbrick-part="marker"
            contentEditable={false}
            aria-hidden="true"
          >
            {type === 'ordered' ? `${orderedNumber}.` : '•'}
          </span>
        )}

        <Editable block={block} />
      </div>

      {children.length > 0 && (
        <div className="block-nested-children" data-inkbrick-part="children">
          <BlockChildren id={block.id} />
        </div>
      )}
    </div>
  );
}
