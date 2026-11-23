import {
  createDocument,
  createSchemaRegistry,
  serializeDocument,
  type BlockSchema,
  type Document,
  type DocumentSnapshot,
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
import type {
  CaretResult,
  CommandName,
  CommandPayload,
  CommandResult,
  EditorIntent,
} from '../dispatcher';
import { builtinCommands } from '../commands';
import { extractFragment } from '../clipboard/extract';
import type { Fragment } from '../clipboard/types';
import { getRangeFormats, type RangeFormats } from '../formats';
import { orderRange } from '../utils';
import { BlockControllers, isBlockDefinition } from '../controller';
import type { AnyBlockController, AnyBlockDefinition } from '../controller/BlockController';
import { resolveFeatures, type EditorFeature } from '../feature';

export interface EditorOptions {
  document?: Document;
  schema?: SchemaRegistry;
  /**
   * Пользовательские блоки, добавляемые к встроенным: схемы или определения `{ schema, controller }`
   * (например, из `defineBlock` в `@inkbrick/react`). Контроллер определения подключается к его flavour.
   */
  blocks?: readonly (BlockSchema | AnyBlockDefinition)[];
  /**
   * Подключаемые возможности (`tableFeature`, `columnsFeature`, …): их блоки, команды, правила и обработка после
   * команд. Блоки возможностей добавляются к `blocks`; со `schema` их схемы уже должны быть в реестре, а возможности
   * блоков сами не подключаются — передайте их здесь.
   */
  features?: readonly EditorFeature[];
  /**
   * Контроллеры по flavour — для блоков, схема которых задана иначе (через `schema` или встроенных).
   * Контроллер того же flavour в `blocks` и здесь — ошибка.
   */
  controllers?: Readonly<Record<string, AnyBlockController>>;
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

    const { features, blocks: definitions } = resolveFeatures(
      options.features ?? [],
      options.blocks ?? [],
    );

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

    for (const feature of features) {
      for (const command of feature.commands ?? []) this.dispatcher.register(command);
      for (const guard of feature.guards ?? []) this.dispatcher.addGuard(guard);
      for (const rule of feature.normalizers ?? []) this.engine.normalizer.add(rule);
      for (const hook of feature.afterCommand ?? []) this.dispatcher.addAfterCommand(hook);
    }

    this.controllers = new BlockControllers(this);

    const explicit = new Set(options.blocks ?? []);
    const own = options.controllers ?? {};

    for (const item of definitions) {
      if (!isBlockDefinition(item) || !item.controller) continue;

      const { flavour } = item.schema;

      // Со своим реестром схем (`schema`) контроллер подключается, только если реестр знает этот блок; контроллер из
      // `controllers` главнее контроллера блока, пришедшего с возможностью.
      if (!this.schema.hasBlock(flavour) || (!explicit.has(item) && flavour in own)) continue;

      this.controllers.register(flavour, item.controller);
    }
    for (const [flavour, controller] of Object.entries(options.controllers ?? {})) {
      this.controllers.register(flavour, controller);
    }

    this.controllers.start();

    for (const feature of features) feature.setup?.(this);
  }

  /**
   * Закрепляет блок: удалить его, превратить в другой тип или вынести из родителя не получится ни командой,
   * ни выделением, захватывающим его целиком — такая команда ничего не меняет. Содержимое блока правится как обычно.
   * `null` снимает закрепление.
   */
  pin(blockId: string | null): void {
    const block = blockId === null ? undefined : this.store.getBlock(blockId);

    if (blockId !== null && !block) throw new Error(`Editor.pin: no block "${blockId}"`);

    this.engine.pinned = block
      ? { id: block.id, parentId: block.parentId, flavour: block.flavour }
      : null;
  }

  /**
   * Выполняет намерение — команду из `CommandMap` с её данными — одним шагом undo. Тип результата выводится из имени
   * команды; `undefined` — команда не выполнена.
   */
  dispatch<I extends EditorIntent>(intent: I): CommandResult<I['type']> | undefined {
    return this.dispatcher.dispatch(intent);
  }

  /**
   * Приводит весь документ к правилам нормализации (`engine.normalizer`: пустые контейнеры, колонки, таблицы и правила
   * возможностей) одной правкой вне истории отмены. Для документа из внешнего источника: импорта, сервера, совместной
   * правки. Возвращает, менялся ли документ. Свои правки редактор нормализует сам после каждой команды.
   */
  normalize(): boolean {
    const before = this.store.getVersion();

    this.store.transact(
      (transaction) => this.engine.normalizer.normalizeAll(this.engine, transaction),
      {
        history: false,
      },
    );

    return this.store.getVersion() !== before;
  }

  /** JSON-снимок документа с версиями формата и схем: его можно сохранить и позже загрузить через `deserializeDocument`. */
  serialize(): DocumentSnapshot {
    return serializeDocument(this.document, this.schema);
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

  /** Выполнится ли команда (документ не меняется). Для команды из `CommandMap` данные проверяются. */
  can<K extends CommandName>(type: K, payload: CommandPayload<K>): boolean;
  can<T extends string>(type: T extends CommandName ? never : T, payload?: unknown): boolean;
  can(type: string, payload?: unknown): boolean {
    return this.dispatcher.can(type as never, payload);
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

  /** Выполняет команду по имени, в том числе команду своего блока. Для команды из `CommandMap` данные и результат типизированы. */
  execute<K extends CommandName>(type: K, payload: CommandPayload<K>): CommandResult<K> | undefined;
  execute<T extends string>(type: T extends CommandName ? never : T, payload?: unknown): unknown;
  execute(type: string, payload?: unknown): unknown {
    return this.dispatcher.execute(type as never, payload);
  }
}
