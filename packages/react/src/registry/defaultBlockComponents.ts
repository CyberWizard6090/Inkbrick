import type { BlockComponentRegistry } from '../ui/types';
import { PageBlock } from '../blocks/PageBlock';
import { NoteBlock } from '../blocks/NoteBlock';
import { ParagraphBlock } from '../blocks/ParagraphBlock';
import { HeadingBlock } from '../blocks/HeadingBlock';
import { ListBlock } from '../blocks/ListBlock';
import { QuoteBlock } from '../blocks/QuoteBlock';
import { CodeBlock } from '../blocks/CodeBlock';
import { DividerBlock } from '../blocks/DividerBlock';
import { CalloutBlock } from '../blocks/CalloutBlock';
import { ImageBlock } from '../blocks/ImageBlock';
import { FormulaBlock } from '../blocks/FormulaBlock';

export const defaultBlockComponents: BlockComponentRegistry = Object.freeze({
  'block:page': PageBlock,
  'block:note': NoteBlock,
  'block:paragraph': ParagraphBlock,
  'block:heading': HeadingBlock,
  'block:list': ListBlock,
  'block:quote': QuoteBlock,
  'block:code': CodeBlock,
  'block:divider': DividerBlock,
  'block:callout': CalloutBlock,
  'block:image': ImageBlock,
  'block:formula': FormulaBlock,
});
