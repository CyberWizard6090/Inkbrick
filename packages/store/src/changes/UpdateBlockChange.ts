import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter } from '../writer';

export class UpdateBlockChange implements Change {
  private previous: BaseBlock | undefined;

  constructor(
    readonly id: BlockId,
    readonly patch: Partial<Pick<BaseBlock, 'flavour' | 'content' | 'props'>>,
  ) {}

  apply(writer: DocumentWriter): void {
    const current = writer.getBlock(this.id);
    if (!current) {
      throw new Error(`Block "${this.id}" not found`);
    }

    this.previous = current;
    writer.setBlock(writer.stamp({ ...current, ...this.patch }, current));
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
