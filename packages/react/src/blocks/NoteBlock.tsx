import { BlockChildren } from './BlockChildren';
import type { BlockProps } from './BlockProps';

export function NoteBlock({ block }: BlockProps) {
  return (
    <section className="page-content" data-inkbrick-block="note" data-block-id={block.id}>
      <BlockChildren id={block.id} />
    </section>
  );
}
