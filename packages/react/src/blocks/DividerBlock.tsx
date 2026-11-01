import type { BlockProps } from './BlockProps';

export function DividerBlock({ block, selected }: BlockProps) {
  return (
    <div
      className="block block-divider"
      data-inkbrick-block="divider"
      data-block-id={block.id}
      data-selected={selected || undefined}
      contentEditable={false}
    >
      <hr data-inkbrick-part="rule" />
    </div>
  );
}
