import type { BlockId } from '@inkbrick/document';
import type { Change } from './Change';
import type { DocumentWriter, SavedMeta } from '../writer';

/**
 * Убирает несколько потомков одного родителя одним изменением: один новый список детей вместо копии на каждого
 * (`RemoveChildChange`). Откат возвращает прежний список целиком — изменения откатываются в обратном порядке, поэтому
 * к этому моменту он снова верен.
 */
export class RemoveChildrenChange implements Change {
  private before: readonly BlockId[] | undefined;

  private saved: SavedMeta | undefined;

  constructor(
    readonly parentId: BlockId,
    readonly childIds: readonly BlockId[],
  ) {}

  apply(writer: DocumentWriter): void {
    this.before = writer.getBlock(this.parentId)?.children;
    writer.removeChildren(this.parentId, new Set(this.childIds));
    this.saved = writer.touch([this.parentId]);
  }

  revert(writer: DocumentWriter): void {
    if (this.before) writer.restoreChildren(this.parentId, this.before);

    writer.restoreMeta(this.saved);
  }

  getAffectedBlocks(): readonly BlockId[] {
    return [this.parentId, ...this.childIds];
  }
}
