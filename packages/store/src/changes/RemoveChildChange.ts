import type { BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter, SavedMeta } from '../writer';

export class RemoveChildChange implements Change {
  private index = -1;

  private saved: SavedMeta | undefined;

  constructor(
    readonly parentId: BlockId,
    readonly childId: BlockId,
  ) {}

  apply(writer: DocumentWriter): void {
    this.index = writer.getBlock(this.parentId)?.children.indexOf(this.childId) ?? -1;
    writer.removeChild(this.parentId, this.childId);
    this.saved = writer.touch([this.parentId]);
  }

  revert(writer: DocumentWriter): void {
    if (this.index !== -1) {
      writer.insertChild(this.parentId, this.index, this.childId);
    }

    writer.restoreMeta(this.saved);
  }

  getAffectedBlocks(): readonly BlockId[] {
    return [this.parentId, this.childId];
  }
}
