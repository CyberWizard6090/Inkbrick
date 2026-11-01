import type { BaseBlock, BlockFlavour, BlockId, BlockProps } from '@inkbrick/document';

import type { Command, CommandContext } from '../commands/Command';
import type { Editor } from '../editor/Editor';
import type {
  BlockCommand,
  BlockCommandContext,
  BlockContext,
  BlockController,
  TypedBlock,
} from './BlockController';

function report(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
}

function propsDiffer(a: BlockProps, b: BlockProps): boolean {
  return a !== b && JSON.stringify(a) !== JSON.stringify(b);
}

function toCommand(flavour: BlockFlavour, command: BlockCommand<any, any>): Command<any> {
  const contextFor = (
    { engine, transaction }: CommandContext,
    blockId: BlockId,
  ): BlockCommandContext<any> => ({
    engine,
    transaction,
    get block() {
      return transaction.getBlock(blockId) as TypedBlock;
    },
    setProps(patch) {
      const block = transaction.getBlock(blockId)!;

      engine.block.morph(transaction, blockId, block.flavour, { ...block.props, ...patch });
    },
  });

  const targetOf = (context: CommandContext, payload: unknown): BlockId | undefined => {
    const blockId = (payload as { blockId?: unknown } | undefined)?.blockId;

    if (typeof blockId !== 'string') return undefined;

    // Команда блока работает только со своими блоками: «счётчик» не изменит параграф.
    return context.transaction.getBlock(blockId)?.flavour === flavour ? blockId : undefined;
  };

  return {
    type: command.type,
    canExecute(context, payload) {
      const blockId = targetOf(context, payload);

      if (!blockId) return false;

      return command.canExecute?.(contextFor(context, blockId), payload) ?? true;
    },
    execute(context, payload) {
      return command.execute(contextFor(context, targetOf(context, payload)!), payload);
    },
  };
}

/**
 * Контроллеры пользовательских блоков редактора (`editor.controllers`): хранит их по flavour, регистрирует их
 * команды и вызывает хуки жизненного цикла по изменениям документа и положению каретки. Не зависит от UI:
 * UI-слой только сообщает, где каретка (`setFocusedBlock`), и читает пункты меню и клавиши через `get`.
 */
export class BlockControllers {
  private readonly controllers = new Map<BlockFlavour, BlockController<any>>();

  private readonly known = new Map<BlockId, BaseBlock>();

  private focused: BlockId | null = null;

  private started = false;

  private pending: BlockId[] = [];

  private processing = false;

  constructor(private readonly editor: Editor) {}

  /** Подключает контроллер к типу блока и регистрирует его команды. Повторно для того же flavour — ошибка. */
  register(flavour: BlockFlavour, controller: BlockController<any>): void {
    if (!this.editor.schema.hasBlock(flavour)) {
      throw new Error(`Controller for "${flavour}": block is not registered in the schema`);
    }
    if (this.controllers.has(flavour)) {
      throw new Error(`Block "${flavour}" already has a controller`);
    }

    for (const command of controller.commands ?? []) {
      if (this.editor.dispatcher.has(command.type)) {
        throw new Error(`Command "${command.type}" of "${flavour}" is already registered`);
      }
    }

    for (const command of controller.commands ?? []) {
      this.editor.dispatcher.register(toCommand(flavour, command));
    }

    this.controllers.set(flavour, controller);

    if (this.started) this.scan(flavour);
  }

  get(flavour: BlockFlavour): BlockController<any> | undefined {
    return this.controllers.get(flavour);
  }

  has(flavour: BlockFlavour): boolean {
    return this.controllers.has(flavour);
  }

  entries(): [BlockFlavour, BlockController<any>][] {
    return [...this.controllers];
  }

  contextFor<TProps extends BlockProps = BlockProps>(
    blockId: BlockId,
  ): BlockContext<TProps> | undefined {
    const block = this.editor.store.getBlock(blockId);

    return block && this.contextOf<TProps>(block);
  }

  get focusedBlockId(): BlockId | null {
    return this.focused;
  }

  setFocusedBlock(blockId: BlockId | null): void {
    if (this.focused === blockId) return;

    const previous = this.focused && this.editor.store.getBlock(this.focused);

    this.focused = blockId;

    if (previous) this.call(previous, 'onBlur');

    const next = blockId && this.editor.store.getBlock(blockId);

    if (next) this.call(next, 'onFocus');
  }

  start(): void {
    if (this.started) return;

    this.started = true;
    this.editor.store.subscribeChanges((ids) => this.handle(ids));

    if (this.controllers.size > 0) this.scan();
  }

  private scan(flavour?: BlockFlavour): void {
    const stack = [this.editor.document.rootId];

    while (stack.length > 0) {
      const block = this.editor.store.getBlock(stack.pop()!);

      if (!block) continue;

      if (
        (flavour === undefined || block.flavour === flavour) &&
        this.controllers.has(block.flavour)
      ) {
        this.known.set(block.id, block);
        this.call(block, 'onCreate');
      }

      for (let i = block.children.length - 1; i >= 0; i--) stack.push(block.children[i]);
    }
  }

  private handle(ids: readonly BlockId[]): void {
    if (this.controllers.size === 0) return;

    this.pending.push(...ids);

    // Хук может выполнить команду — её изменения обработаются после текущих, без рекурсии.
    if (this.processing) return;

    this.processing = true;

    try {
      while (this.pending.length > 0) {
        const id = this.pending.shift()!;

        this.diff(id);
      }
    } finally {
      this.processing = false;
    }
  }

  private diff(id: BlockId): void {
    const previous = this.known.get(id);
    const current = this.editor.store.getBlock(id);
    const typeChanged = !!previous && (!current || current.flavour !== previous.flavour);

    if (previous && typeChanged) {
      this.known.delete(id);

      if (this.focused === id) {
        // Блок удалён — каретки в нём больше нет; при смене типа она остаётся (и «входит» в новый тип ниже).
        if (!current) this.focused = null;
        this.call(previous, 'onBlur');
      }

      this.call(previous, 'onRemove');
    }

    if (!current || !this.controllers.has(current.flavour)) return;

    this.known.set(id, current);

    if (!previous || typeChanged) {
      this.call(current, 'onCreate');
      this.call(current, 'onInsert');

      // Параграф с кареткой превратили в блок с контроллером (slash-меню): каретка уже в нём.
      if (this.focused === id) this.call(current, 'onFocus');
    } else if (propsDiffer(previous.props, current.props)) {
      this.call(current, 'onPropsChange', previous.props);
    }
  }

  private call(
    block: BaseBlock,
    hook: 'onCreate' | 'onInsert' | 'onRemove' | 'onFocus' | 'onBlur' | 'onPropsChange',
    previousProps?: BlockProps,
  ): void {
    const handler = this.controllers.get(block.flavour)?.[hook];

    if (!handler) return;

    // Ошибка в хуке не должна ломать редактор и остальные хуки.
    try {
      handler(this.contextOf(block), previousProps as never);
    } catch (error) {
      report(error);
    }
  }

  contextOf<TProps extends BlockProps = BlockProps>(block: BaseBlock): BlockContext<TProps> {
    const editor = this.editor;
    const withId = (payload?: Record<string, unknown>) => ({ ...payload, blockId: block.id });

    return {
      editor,
      block: block as TypedBlock<TProps>,
      get readOnly() {
        return editor.readOnly;
      },
      execute: (type, payload) => editor.execute(type, withId(payload)),
      can: (type, payload) => editor.can(type, withId(payload)),
    };
  }
}
