import { BlockFlavour } from './BlockFlavour';
import { BlockId } from './BlockId';
import { BlockMeta } from './BlockMeta';
import { BlockProps } from './BlockProps';
import { InlineNode } from './InlineNode';

export interface BaseBlock {
  id: BlockId;
  flavour: BlockFlavour;
  parentId: BlockId | null;
  children: BlockId[];
  content: InlineNode[];
  props: BlockProps;
  /** Когда и кем создан/изменён блок; есть только при включённой опции `meta` хранилища. */
  meta?: BlockMeta;
}
