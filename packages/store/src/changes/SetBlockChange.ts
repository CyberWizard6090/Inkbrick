import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter } from '../writer';

export class SetBlockChange implements Change {
  private previous: BaseBlock | undefined;

  constructor(readonly block: BaseBlock) {}

  apply(writer: DocumentWriter): void {
    this.previous = writer.getBlock(this.block.id);
    writer.setBlock(writer.stamp(this.block, this.previous));
  }

  revert(writer: DocumentWriter): void {
    if (this.previous) {
      writer.setBlock(this.previous);
    } else {
      writer.deleteBlock(this.block.id);
    }
  }

  getAffectedBlocks(): readonly BlockId[] {
    return [this.block.id];
  }
}
