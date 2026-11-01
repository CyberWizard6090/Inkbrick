import type { BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter, SavedMeta } from '../writer';

export class MoveChildChange implements Change {
  private fromIndex = -1;

  private saved: SavedMeta | undefined;

  constructor(
    readonly fromParent: BlockId,
    readonly toParent: BlockId,
    readonly childId: BlockId,
    readonly index: number,
  ) {}

  apply(writer: DocumentWriter): void {
    this.fromIndex = writer.getBlock(this.fromParent)?.children.indexOf(this.childId) ?? -1;
    writer.moveChild(this.fromParent, this.toParent, this.childId, this.index);
    this.saved = writer.touch([this.fromParent, this.toParent, this.childId]);
  }

  revert(writer: DocumentWriter): void {
    writer.moveChild(
      this.toParent,
      this.fromParent,
      this.childId,
      this.fromIndex === -1 ? 0 : this.fromIndex,
    );
    writer.restoreMeta(this.saved);
  }

  getAffectedBlocks(): readonly BlockId[] {
    return [this.fromParent, this.toParent, this.childId];
  }
}
