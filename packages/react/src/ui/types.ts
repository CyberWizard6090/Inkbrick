import type { Spellchecker, FormulaRenderer } from '@inkbrick/view';
import type { ComponentType, ReactNode } from 'react';

import type { BaseBlock } from '@inkbrick/document';
import type { AnyBlockController, Editor } from '@inkbrick/engine';

import type { ImageOptions } from '../images/types';
import type { SlashMenuItem, SlashMenuProps } from '../slash/types';
import type { BlockHandleProps, BlockMenuProps, DropIndicatorProps } from '../block-handle/types';
import type { CodeHighlighter } from '@inkbrick/dom/code-highlight';
import type { TFunction } from '@inkbrick/locales';
import type { KeyBinding } from '../keymap/types';
import type { ToolbarProps } from '../toolbar/types';
import type { ContextMenuItem, ContextMenuProps, FormattingMode } from '../context-menu/types';
import type { BlockContextMenuContext } from '../blocks/defineBlock';

/**
 * Props, которые получает React-представление блока.
 *
 * Блок нельзя изменять напрямую: все изменения документа идут через
 * `editor.dispatch(...)`. Для редактируемого текста используйте компонент
 * `<Editable block={block} placeholder="…" />` — он подключает ввод, выделение и
 * клавиатурные действия редактора. Дочерние блоки выводит `<BlockChildren id={block.id} />`.
 */
export interface BlockViewProps<TBlock extends BaseBlock = BaseBlock> {
  readonly block: TBlock;
  readonly editor: Editor;
  readonly selected: boolean;
  readonly readOnly: boolean;
  /**
   * Контроллер типа блока (`defineBlock({ controller })`), если есть. Удобнее хук `useBlockController(block)`:
   * его `execute`/`can` сами подставляют `blockId`.
   */
  readonly controller?: AnyBlockController;
}

export type BlockComponent<TBlock extends BaseBlock = BaseBlock> = ComponentType<
  BlockViewProps<TBlock>
>;

export type BlockComponentRegistry = Readonly<Partial<Record<string, BlockComponent>>>;

export interface UnknownBlockViewProps extends BlockViewProps {
  /** Уже выведенные дочерние блоки (данные не теряются, даже если тип блока неизвестен). */
  readonly children?: ReactNode;
}

export interface EditorSlots {
  readonly UnknownBlock?: ComponentType<UnknownBlockViewProps>;
  readonly SlashMenu?: ComponentType<SlashMenuProps>;
  readonly Toolbar?: ComponentType<ToolbarProps> | null;
  /**
   * Ручка слева от блока («+» и хваталка для переноса); `null` отключает ручки, меню и встроенное перетаскивание.
   * Свой DnD подключается через `useBlockDrag()` — в своей ручке или в любом компоненте внутри `<EditorProvider>`.
   */
  readonly BlockHandle?: ComponentType<BlockHandleProps> | null;
  readonly BlockMenu?: ComponentType<BlockMenuProps>;
  readonly DropIndicator?: ComponentType<DropIndicatorProps> | null;
  /** Контекстное меню документа (правый клик); `null` оставляет меню браузера. */
  readonly ContextMenu?: ComponentType<ContextMenuProps> | null;
}

export interface EditorUIConfig {
  readonly components: BlockComponentRegistry;
  readonly slots: EditorSlots;
  readonly slashItems: readonly SlashMenuItem[];
  readonly highlighter: CodeHighlighter | null;
  readonly formulaRenderer: FormulaRenderer | null;
  readonly locale: string;
  /**
   * Проверка орфографии браузера включена; `lang` — язык документа для неё (по умолчанию язык интерфейса), `checker` —
   * источник вариантов исправления для контекстного меню.
   */
  readonly spellcheck: { readonly lang: string; readonly checker?: Spellchecker } | false;
  readonly t: TFunction;
  readonly keymap: readonly KeyBinding[];
  readonly images: ImageOptions;
  readonly formatting: FormattingMode;
  readonly contextMenu: readonly ((
    context: BlockContextMenuContext,
  ) => readonly ContextMenuItem[])[];
  readonly readOnly?: boolean;
}
