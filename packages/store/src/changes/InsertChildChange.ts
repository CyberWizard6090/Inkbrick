import type { BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter, SavedMeta } from '../writer';

export class InsertChildChange implements Change {
  private saved: SavedMeta | undefined;

  constructor(
    readonly parentId: BlockId,
    readonly index: number,
    readonly childId: BlockId,
  ) {}

  apply(writer: DocumentWriter): void {
    writer.insertChild(this.parentId, this.index, this.childId);
    this.saved = writer.touch([this.parentId]);
  }

  revert(writer: DocumentWriter): void {
    writer.removeChild(this.parentId, this.childId);
    writer.restoreMeta(this.saved);
  }

  getAffectedBlocks(): readonly BlockId[] {
    return [this.parentId, this.childId];
  }
}
