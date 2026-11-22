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
  /**
   * Версия схемы, по которой записан блок (`BlockSchema.version`). Есть в снимке у каждого блока: `serializeDocument`
   * ставит её всегда, при загрузке по ней мигрируют props. В открытом документе у блоков известного типа поля нет —
   * они всегда текущей версии; у блоков неизвестного типа оно хранится как пришло.
   */
  version?: number;
}
