import {
  createDocument,
  createSchemaRegistry,
  type BlockSchema,
  type Document,
  type SchemaRegistry,
} from '@inkbrick/document';
import {
  createStore,
  type BlockMetaOptions,
  type DocumentStore,
  type HistoryOptions,
} from '@inkbrick/store';

import { createEngine } from './createEngine';
import type { Engine } from './Engine';
import { Dispatcher } from '../dispatcher';
import type { CaretResult, EditorIntent } from '../dispatcher';
import { builtinCommands } from '../commands';
import { extractFragment } from '../clipboard/extract';
import type { Fragment } from '../clipboard/types';
import { getRangeFormats, type RangeFormats } from '../formats';
import { orderRange } from '../utils';
import { BlockControllers, isBlockDefinition } from '../controller';
import type { BlockController, BlockDefinition } from '../controller';

export interface EditorOptions {
  document?: Document;
  schema?: SchemaRegistry;
  /**
   * Пользовательские блоки, добавляемые к встроенным: схемы или определения `{ schema, controller }`
   * (например, из `defineBlock` в `@inkbrick/react`). Контроллер определения подключается к его flavour.
   */
  blocks?: readonly (BlockSchema | BlockDefinition<any>)[];
  /**
   * Контроллеры по flavour — для блоков, схема которых задана иначе (через `schema` или встроенных).
   * Контроллер того же flavour в `blocks` и здесь — ошибка.
   */
  controllers?: Readonly<Record<string, BlockController<any>>>;
  history?: HistoryOptions;
  /** Заполнять `meta` блоков (создан/изменён, кем). `true` — только время, объект — ещё и автор (`user`). */
  meta?: boolean | BlockMetaOptions;
}

export interface HistoryResult {
  caret?: CaretResult;
}

export class Editor {
  readonly document: Document;
  readonly schema: SchemaRegistry;
  readonly store: DocumentStore;
  readonly engine: Engine;
  readonly dispatcher: Dispatcher;
  readonly controllers: BlockControllers;

  constructor(options: EditorOptions = {}) {
    if (options.schema && options.blocks) {
      throw new Error('Editor: pass either "schema" or "blocks", not both');
    }

    const definitions = options.blocks ?? [];

    this.schema =
      options.schema ??
      createSchemaRegistry(
        definitions.map((item) => (isBlockDefinition(item) ? item.schema : item)),
      );
    this.document = options.document ?? createDocument({ schema: this.schema });
    this.store = createStore({
      document: this.document,
      history: options.history,
      meta: options.meta,
    });
    this.engine = createEngine({ store: this.store, schema: this.schema });
    this.dispatcher = new Dispatcher(this.engine);

    for (const command of builtinCommands) {
      this.dispatcher.register(command);
    }

    this.controllers = new BlockControllers(this);

    for (const item of definitions) {
      if (isBlockDefinition(item) && item.controller) {
        this.controllers.register(item.schema.flavour, item.controller);
      }
    }
    for (const [flavour, controller] of Object.entries(options.controllers ?? {})) {
      this.controllers.register(flavour, controller);
    }

    this.controllers.start();
  }

  dispatch(intent: EditorIntent): unknown {
    return this.dispatcher.dispatch(intent);
  }

  private readonly readOnlyListeners = new Set<() => void>();

  get readOnly(): boolean {
    return this.engine.readOnly;
  }

  setReadOnly(value: boolean): void {
    if (this.engine.readOnly === value) return;

    this.engine.readOnly = value;

    for (const listener of [...this.readOnlyListeners]) listener();
  }

  subscribeReadOnly(listener: () => void): () => void {
    this.readOnlyListeners.add(listener);

    return () => {
      this.readOnlyListeners.delete(listener);
    };
  }

  /**
   * Id блоков между двумя точками выделения (включая крайние) в порядке документа: и текстовых, и без текста
   * (картинка, разделитель). Страница и заметка (структурные контейнеры) и блоки неизвестного типа не входят.
   */
  blocksBetween(
    from: { blockId: string; offset: number },
    to: { blockId: string; offset: number },
  ): string[] {
    const getBlock = this.store.getBlock.bind(this.store);
    const range = orderRange(getBlock, this.document.rootId, from, to);

    return range
      ? range.blocks
          .filter((block) => {
            const parent = block.parentId ? getBlock(block.parentId) : undefined;

            return this.schema.hasBlock(block.flavour) && !!parent?.parentId;
          })
          .map((block) => block.id)
      : [];
  }

  /**
   * Выполняет несколько dispatch/execute как одно действие: один шаг undo, один рендер,
   * при ошибке откатывается всё. `mergeKey` позволяет слить шаг с соседним шагом с тем же ключом.
   *
   * `fn` должна быть синхронной: async-функция (Promise в результате) отклоняется с откатом. Для работы
   * с ожиданием (загрузка файла) делайте несколько batch с общим `mergeKey`, как вставка картинок.
   */
  batch<T>(fn: () => T, options?: { mergeKey?: string }): T {
    return this.dispatcher.batch(fn, options);
  }

  get canUndo(): boolean {
    return this.store.canUndo;
  }

  get canRedo(): boolean {
    return this.store.canRedo;
  }

  undo(): HistoryResult | undefined {
    if (this.engine.readOnly) return undefined;

    const step = this.store.undo();

    return step && { caret: step.meta?.before as CaretResult | undefined };
  }

  redo(): HistoryResult | undefined {
    if (this.engine.readOnly) return undefined;

    const step = this.store.redo();

    return step && { caret: step.meta?.after as CaretResult | undefined };
  }

  sealHistory(): void {
    this.store.sealHistory();
  }

  clearHistory(): void {
    this.store.clearHistory();
  }

  can(type: string, payload?: unknown): boolean {
    return this.dispatcher.can(type, payload);
  }

  copyFragment(
    from: { blockId: string; offset: number },
    to: { blockId: string; offset: number },
  ): Fragment {
    return extractFragment(this, from, to);
  }

  formatsAt(
    from: { blockId: string; offset: number },
    to: { blockId: string; offset: number },
  ): RangeFormats {
    return getRangeFormats(this, from, to);
  }

  execute(type: string, payload?: unknown): unknown {
    return this.dispatcher.execute(type, payload);
  }
}
