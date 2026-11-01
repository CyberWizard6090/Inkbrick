import { getBlockAlign } from '@inkbrick/document';

import { Editable } from './Editable';
import type { BlockProps } from './BlockProps';

export function ParagraphBlock({ block, selected }: BlockProps) {
  const align = getBlockAlign(block) ?? 'left';

  return (
    <div
      className="block block-paragraph"
      data-inkbrick-block="paragraph"
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-align={align}
    >
      <Editable block={block} />
    </div>
  );
}
