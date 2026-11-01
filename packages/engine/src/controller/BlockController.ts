import type { BaseBlock, BlockId, BlockProps, BlockSchema } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Editor } from '../editor/Editor';
import type { Engine } from '../editor/Engine';

export type TypedBlock<TProps extends BlockProps = BlockProps> = Omit<BaseBlock, 'props'> & {
  readonly props: TProps;
};

/**
 * Что получает хук жизненного цикла и обработчик пункта меню/клавиши: редактор, блок и режим.
 * Блок — снимок на момент вызова; свежую версию даёт `editor.store.getBlock(block.id)`.
 */
export interface BlockContext<TProps extends BlockProps = BlockProps> {
  readonly editor: Editor;
  readonly block: TypedBlock<TProps>;
  readonly readOnly: boolean;
  /**
   * Выполняет команду контроллера (или любую другую) для этого блока: `blockId` подставляется в payload сам.
   * Возвращает результат команды; в режиме только чтения и при недопустимом payload — `undefined`.
   */
  execute(type: string, payload?: Record<string, unknown>): unknown;
  can(type: string, payload?: Record<string, unknown>): boolean;
}

export interface BlockCommandContext<TProps extends BlockProps = BlockProps> {
  readonly engine: Engine;
  readonly transaction: Transaction;
  readonly block: TypedBlock<TProps>;
  /** Сливает `patch` с props блока (с проверкой по `propsSchema`; недопустимые props — ошибка и откат). */
  setProps(patch: Partial<TProps>): void;
}

export type BlockCommandPayload<TExtra extends object = Record<string, unknown>> = TExtra & {
  readonly blockId: BlockId;
};

/**
 * Команда пользовательского блока. Регистрируется в `Dispatcher` редактора под именем `type`
 * и выполняется только для блоков своего flavour и только вне режима только чтения.
 */
export interface BlockCommand<
  TProps extends BlockProps = BlockProps,
  TPayload extends object = Record<string, unknown>,
> {
  readonly type: string;
  /** Дополнительное условие (кроме flavour и read-only); без него команда допустима всегда. */
  canExecute?(
    context: BlockCommandContext<TProps>,
    payload: BlockCommandPayload<TPayload>,
  ): boolean;
  execute(context: BlockCommandContext<TProps>, payload: BlockCommandPayload<TPayload>): unknown;
}

export interface BlockSlashItem<TProps extends BlockProps = BlockProps> {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  /** Имя иконки UI-кита (для `@inkbrick/react` — имя из `IconName`). */
  readonly icon?: string;
  readonly props?: Partial<TProps>;
}

export interface BlockMenuItem<TProps extends BlockProps = BlockProps> {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly danger?: boolean;
  /** Пункт недоступен (например, команда не выполнится). По умолчанию доступен вне режима только чтения. */
  isDisabled?(context: BlockContext<TProps>): boolean;
  run(context: BlockContext<TProps>): unknown;
}

export interface BlockKeyBinding<TProps extends BlockProps = BlockProps> {
  readonly id: string;
  /** Комбинации в формате keymap: `'Mod-ArrowUp'`, `'Alt-Shift-r'`. */
  readonly keys: string | readonly string[];
  /** `false` — «не моё», нажатие обрабатывается дальше. */
  run(context: BlockContext<TProps>): boolean | void;
}

/**
 * Поведение пользовательского блока, независимое от UI. Все поля необязательны.
 *
 * Хуки вызываются после того, как изменение применено и записано в историю, — в том числе при undo/redo.
 * Хук может выполнять команды: они станут отдельным шагом истории.
 */
export interface BlockController<TProps extends BlockProps = BlockProps> {
  /** Блок появился в редакторе: был в документе при создании редактора или вставлен правкой. */
  onCreate?(context: BlockContext<TProps>): void;
  /** Блок вставлен правкой (команда, вставка из буфера, смена типа, undo удаления). Вызывается после `onCreate`. */
  onInsert?(context: BlockContext<TProps>): void;
  /** Блок удалён из документа (или сменил тип). `block` — состояние до удаления. */
  onRemove?(context: BlockContext<TProps>): void;
  onPropsChange?(context: BlockContext<TProps>, previous: TProps): void;
  onFocus?(context: BlockContext<TProps>): void;
  onBlur?(context: BlockContext<TProps>): void;

  readonly commands?: readonly BlockCommand<TProps, any>[];
  readonly slashItems?: readonly BlockSlashItem<TProps>[];
  readonly menuItems?: readonly BlockMenuItem<TProps>[];
  readonly keymap?: readonly BlockKeyBinding<TProps>[];
}

export interface BlockDefinition<TProps extends BlockProps = BlockProps> {
  readonly schema: BlockSchema;
  readonly controller?: BlockController<TProps>;
}

export function defineBlockController<TProps extends BlockProps = BlockProps>(
  controller: BlockController<TProps>,
): BlockController<TProps> {
  return controller;
}

export function defineBlockCommand<
  TProps extends BlockProps = BlockProps,
  TPayload extends object = Record<string, unknown>,
>(command: BlockCommand<TProps, TPayload>): BlockCommand<TProps, TPayload> {
  return command;
}

export function isBlockDefinition(
  value: BlockSchema | BlockDefinition<any>,
): value is BlockDefinition<any> {
  return (
    typeof (value as BlockDefinition).schema === 'object' &&
    (value as BlockDefinition).schema !== null
  );
}
