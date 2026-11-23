import type { EditorFeature } from '../feature';
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
  /** Группа пункта в меню вставки: `basic`, `media`, `advanced` или своя; без группы пункт идёт после всех групп. */
  readonly group?: string;
  /**
   * Ключи словаря приложения для названия, описания и слов поиска (через запятую): редактор берёт строки из словаря
   * текущего языка, а `title`, `description` и `keywords` остаются запасными, если ключа в словаре нет.
   */
  readonly titleKey?: string;
  readonly descriptionKey?: string;
  readonly keywordsKey?: string;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each command has its own payload type
  readonly commands?: readonly BlockCommand<TProps, any>[];
  readonly slashItems?: readonly BlockSlashItem<TProps>[];
  readonly menuItems?: readonly BlockMenuItem<TProps>[];
  readonly keymap?: readonly BlockKeyBinding<TProps>[];
}

export interface BlockDefinition<TProps extends BlockProps = BlockProps> {
  readonly schema: BlockSchema;
  readonly controller?: BlockController<TProps>;
  /** Возможность движка, без которой блок не работает (колонкам — перенос блока вбок): подключается вместе с ним. */
  readonly feature?: EditorFeature;
}

/*
 * Определения, контроллеры и команды блоков с любыми props: так их держат списки разных блоков. Props у каждого блока
 * свои, а параметр типа инвариантен (props и принимаются, и отдаются), поэтому общего типа, кроме `any`, у списка нет.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a list of blocks with different props (see above)
export type AnyBlockDefinition = BlockDefinition<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a list of blocks with different props (see above)
export type AnyBlockController = BlockController<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- commands of blocks with different props and payloads
export type AnyBlockCommand = BlockCommand<any, any>;

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
  value: BlockSchema | AnyBlockDefinition,
): value is AnyBlockDefinition {
  return (
    typeof (value as BlockDefinition).schema === 'object' &&
    (value as BlockDefinition).schema !== null
  );
}
