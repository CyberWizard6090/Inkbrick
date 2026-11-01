import type { Command } from './Command';
import { InsertTextCommand } from './InsertTextCommand';
import { DeleteTextCommand } from './DeleteTextCommand';
import { DeleteBackwardCommand } from './DeleteBackwardCommand';
import { SplitBlockCommand } from './SplitBlockCommand';
import { MorphBlockCommand } from './MorphBlockCommand';
import { InsertParagraphCommand } from './InsertParagraphCommand';
import { DeleteBlockCommand } from './DeleteBlockCommand';
import { ToggleHeadingCommand } from './ToggleHeadingCommand';
import { ReplaceTextCommand } from './ReplaceTextCommand';
import { ToggleFormatCommand } from './ToggleFormatCommand';
import { SetBlockPropsCommand } from './SetBlockPropsCommand';
import { InsertBlockCommand } from './InsertBlockCommand';
import { DeleteRangeCommand } from './DeleteRangeCommand';
import { ConvertBlockCommand } from './ConvertBlockCommand';
import { MoveBlockCommand } from './MoveBlockCommand';
import { PasteFragmentCommand } from './PasteFragmentCommand';
import { DuplicateBlockCommand } from './DuplicateBlockCommand';
import { ToggleFormatRangeCommand } from './ToggleFormatRangeCommand';
import { SetInlineAttributesCommand } from './SetInlineAttributesCommand';
import { IndentBlockCommand, OutdentBlockCommand } from './IndentCommands';
import { InsertFormulaCommand } from './InsertFormulaCommand';
import { SetAlignCommand } from './SetAlignCommand';

export type { Command, CommandContext } from './Command';

export {
  InsertTextCommand,
  DeleteTextCommand,
  DeleteBackwardCommand,
  SplitBlockCommand,
  MorphBlockCommand,
  InsertParagraphCommand,
  DeleteBlockCommand,
  ToggleHeadingCommand,
  ReplaceTextCommand,
  ToggleFormatCommand,
  SetBlockPropsCommand,
  InsertBlockCommand,
  DeleteRangeCommand,
  ConvertBlockCommand,
  MoveBlockCommand,
  PasteFragmentCommand,
  DuplicateBlockCommand,
  ToggleFormatRangeCommand,
  SetInlineAttributesCommand,
  IndentBlockCommand,
  OutdentBlockCommand,
  InsertFormulaCommand,
  SetAlignCommand,
};

export const builtinCommands: readonly Command<any, any>[] = [
  InsertTextCommand,
  DeleteTextCommand,
  DeleteBackwardCommand,
  SplitBlockCommand,
  MorphBlockCommand,
  InsertParagraphCommand,
  DeleteBlockCommand,
  ToggleHeadingCommand,
  ReplaceTextCommand,
  ToggleFormatCommand,
  SetBlockPropsCommand,
  InsertBlockCommand,
  DeleteRangeCommand,
  ConvertBlockCommand,
  MoveBlockCommand,
  PasteFragmentCommand,
  DuplicateBlockCommand,
  ToggleFormatRangeCommand,
  SetInlineAttributesCommand,
  IndentBlockCommand,
  OutdentBlockCommand,
  InsertFormulaCommand,
  SetAlignCommand,
];
