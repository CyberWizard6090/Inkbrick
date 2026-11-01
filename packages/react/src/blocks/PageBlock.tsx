import { BlockChildren } from './BlockChildren';
import type { BlockProps } from './BlockProps';

export function PageBlock({ block }: BlockProps) {
  return (
    <div className="page" data-inkbrick-block="page" data-block-id={block.id}>
      <BlockChildren id={block.id} />
    </div>
  );
}
