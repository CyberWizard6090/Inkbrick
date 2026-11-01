import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter } from '../writer';

export class DeleteBlockChange implements Change {
  private previous: BaseBlock | undefined;

  constructor(readonly id: BlockId) {}

  apply(writer: DocumentWriter): void {
    this.previous = writer.getBlock(this.id);
    writer.deleteBlock(this.id);
  }

  revert(writer: DocumentWriter): void {
    if (this.previous) {
      writer.setBlock(this.previous);
    }
  }

  getAffectedBlocks(): readonly BlockId[] {
    return [this.id];
  }
}
