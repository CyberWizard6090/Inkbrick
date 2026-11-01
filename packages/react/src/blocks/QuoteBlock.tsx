import { getBlockAlign } from '@inkbrick/document';

import { Editable } from './Editable';
import type { BlockProps } from './BlockProps';

export function QuoteBlock({ block, selected }: BlockProps) {
  return (
    <blockquote
      className="block block-quote"
      data-inkbrick-block="quote"
      data-align={getBlockAlign(block) ?? 'left'}
      data-block-id={block.id}
      data-selected={selected || undefined}
    >
      <Editable block={block} />
    </blockquote>
  );
}
