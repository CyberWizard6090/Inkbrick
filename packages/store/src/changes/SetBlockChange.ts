import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter } from '../writer';

export class SetBlockChange implements Change {
  private previous: BaseBlock | undefined;

  /** `stamp: false` — блок пишется как есть, без отметки `meta` (чужой блок из синхронизации со своей `meta`). */
  constructor(
    readonly block: BaseBlock,
    private readonly options: { readonly stamp?: boolean } = {},
  ) {}

  apply(writer: DocumentWriter): void {
    this.previous = writer.getBlock(this.block.id);
    writer.setBlock(
      this.options.stamp === false ? this.block : writer.stamp(this.block, this.previous),
    );
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
