import { getBlockAlign } from '@inkbrick/document';

import { Editable } from './Editable';
import type { BlockProps } from './BlockProps';

export function HeadingBlock({ block, selected }: BlockProps) {
  const level = typeof block.props.level === 'number' ? block.props.level : 1;
  const align = getBlockAlign(block) ?? 'left';

  return (
    <div
      className={`block block-heading level-${level}`}
      data-inkbrick-block="heading"
      data-level={level}
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-align={align}
    >
      <Editable block={block} />
    </div>
  );
}
