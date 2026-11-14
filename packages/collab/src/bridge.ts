import * as Y from 'yjs';

import {
  deserializeDocument,
  repairSnapshot,
  type BaseBlock,
  type BlockId,
  type Document,
  type DocumentSnapshot,
  type SchemaRegistry,
} from '@inkbrick/document';
import {
  DeleteBlockChange,
  SetBlockChange,
  type Change,
  type DocumentStore,
} from '@inkbrick/store';

import { deepEqual } from './equal';
import { COLLAB_ORIGIN, getBlocks, isInitialized, readPlace, type YBlock } from './format';
import { normalizeSnapshot, project } from './project';
import {
  resolveSelection,
  shareSelection,
  type SelectionPoint,
  type SharedSelection,
} from './selection';
import { inlineEquals } from './textDiff';
import { reconcileChildren, writeBlockData } from './writer';

/** Метка обновлений, пришедших снаружи: их не нужно отправлять обратно. */
export const REMOTE_ORIGIN = 'inkbrick-remote';

export interface CollabOptions {
  ydoc: Y.Doc;
  schema: SchemaRegistry;
  /** Окно слияния шагов отмены, мс (как `mergeWindowMs` истории). */
  undoCaptureMs?: number;
  /** Сколько можно придерживать чужие правки во время IME-композиции, мс. */
  composeTimeoutMs?: number;
  /** Ошибка применения чужой правки; после неё мост уже выполнил полную сверку. */
  onError?: (error: unknown) => void;
}

/** What a local update changed besides its bytes. */
export interface LocalUpdateMeta {
  /** Ids of the blocks the transaction changed (they feed the "who edited this block" record of the server). */
  touched: string[];
}

export interface CollabHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
  /** Следующая правка начнёт новый шаг. */
  seal(): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

/** Ids of the blocks a Yjs transaction changed: added, removed, or changed inside (props, text, place). */
function changedBlockIds(ydoc: Y.Doc, transaction: Y.Transaction): string[] {
  const blocks = getBlocks(ydoc);
  const ids = new Set<string>();

  for (const [type, keys] of transaction.changed) {
    if ((type as unknown) === blocks) {
      for (const key of keys) if (typeof key === 'string') ids.add(key);

      continue;
    }

    let current: Y.AbstractType<any> = type;

    while (current.parent && (current.parent as unknown) !== blocks) {
      current = current.parent as Y.AbstractType<any>;
    }

    const id = (current.parent as unknown) === blocks ? current._item?.parentSub : undefined;

    if (typeof id === 'string') ids.add(id);
  }

  return [...ids];
}

function blockEquals(a: BaseBlock, b: BaseBlock): boolean {
  return (
    a.flavour === b.flavour &&
    a.parentId === b.parentId &&
    deepEqual(a.children, b.children) &&
    deepEqual(a.props, b.props) &&
    inlineEquals(a.content, b.content)
  );
}

/**
 * Мост между `DocumentStore` и `Y.Doc`. Источник правды — `Y.Doc`, хранилище его проекция.
 *
 *  - локальная правка: после коммита мост сравнивает изменённые блоки с `Y.Doc` и пишет разницу;
 *  - чужая правка, undo, redo: проекция всего `Y.Doc` сравнивается с хранилищем, разница применяется.
 */
export class Collab {
  readonly ydoc: Y.Doc;

  readonly schema: SchemaRegistry;

  readonly history: CollabHistory;

  private store: DocumentStore | undefined;

  private unsubscribeStore: (() => void) | undefined;

  private applying = false;

  private composing = false;

  private queue: Uint8Array[] = [];

  private composeTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly undoManager: Y.UndoManager;

  private readonly historyListeners = new Set<() => void>();

  private readonly updateListeners = new Set<(update: Uint8Array, meta: LocalUpdateMeta) => void>();

  private touched: string[] = [];

  private readonly options: CollabOptions;

  constructor(options: CollabOptions) {
    this.options = options;
    this.ydoc = options.ydoc;
    this.schema = options.schema;

    if (!isInitialized(this.ydoc)) {
      throw new Error(
        'Y.Doc is empty: the initial document must be created by whoever creates the document (initYDoc), not by a client that opens it',
      );
    }

    this.undoManager = new Y.UndoManager(getBlocks(this.ydoc), {
      trackedOrigins: new Set([COLLAB_ORIGIN]),
      captureTimeout: options.undoCaptureMs ?? 1000,
    });

    const notify = (): void => {
      for (const listener of [...this.historyListeners]) listener();
    };

    this.undoManager.on('stack-item-added', notify);
    this.undoManager.on('stack-item-popped', notify);
    this.undoManager.on('stack-cleared', notify);

    const undoManager = this.undoManager;

    this.history = {
      get canUndo() {
        return undoManager.canUndo();
      },
      get canRedo() {
        return undoManager.canRedo();
      },
      undo: () => {
        undoManager.undo();
      },
      redo: () => {
        undoManager.redo();
      },
      seal: () => undoManager.stopCapturing(),
      clear: () => undoManager.clear(),
      subscribe: (listener) => {
        this.historyListeners.add(listener);

        return () => {
          this.historyListeners.delete(listener);
        };
      },
    };

    // Yjs emits `afterTransaction` before `update`, so the blocks of a transaction are known when its update goes out.
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      const touched = this.touched;

      this.touched = [];

      if (origin === REMOTE_ORIGIN) return;

      for (const listener of [...this.updateListeners]) listener(update, { touched });
    });

    this.ydoc.on('afterTransaction', (transaction: Y.Transaction) => {
      this.touched = changedBlockIds(this.ydoc, transaction);

      if (transaction.origin === COLLAB_ORIGIN) return;

      this.pull();
    });
  }

  /** Снимок проекции, пригодный для `deserializeDocument`. */
  snapshot(): DocumentSnapshot {
    return normalizeSnapshot(project(this.ydoc), this.schema);
  }

  /** Модель документа для `new Editor({ document })`. */
  createDocument(): Document {
    const snapshot = this.snapshot();

    try {
      return deserializeDocument(snapshot, { schema: this.schema });
    } catch {
      return deserializeDocument(repairSnapshot(snapshot, this.schema).snapshot, {
        schema: this.schema,
      });
    }
  }

  /** Подписывает мост на хранилище редактора (`editor.store`). Возвращает отписку. */
  attach(store: DocumentStore): () => void {
    this.detach();
    this.store = store;
    this.unsubscribeStore = store.subscribeChanges((ids) => {
      if (this.applying) return;

      this.push(ids);
    });

    return () => this.detach();
  }

  detach(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
    this.store = undefined;
  }

  /** Обновление снаружи (не `Y.applyUpdate`): на время IME-композиции оно придерживается. */
  receive(update: Uint8Array): void {
    if (this.composing) {
      this.queue.push(update);
      return;
    }

    Y.applyUpdate(this.ydoc, update, REMOTE_ORIGIN);
  }

  /** Обновления, которые нужно отправить другим (всё, кроме пришедшего снаружи). */
  onLocalUpdate(listener: (update: Uint8Array, meta: LocalUpdateMeta) => void): () => void {
    this.updateListeners.add(listener);

    return () => {
      this.updateListeners.delete(listener);
    };
  }

  /** Выделение в виде, пригодном для присутствия (`connection.setAwareness({ selection })`). */
  shareSelection(selection: {
    anchor: SelectionPoint;
    head: SelectionPoint;
  }): SharedSelection | undefined {
    return shareSelection(this.ydoc, selection);
  }

  /** Выделение другого участника в координатах модели с учётом всех правок после того, как он его поставил. */
  resolveSelection(shared: unknown): { anchor: SelectionPoint; head: SelectionPoint } | undefined {
    return resolveSelection(this.ydoc, shared);
  }

  /** Редактор сообщает о начале и конце IME-композиции. */
  setComposing(composing: boolean): void {
    if (this.composing === composing) return;

    this.composing = composing;
    clearTimeout(this.composeTimer);

    if (composing) {
      this.composeTimer = setTimeout(
        () => this.setComposing(false),
        this.options.composeTimeoutMs ?? 5000,
      );
      return;
    }

    const queued = this.queue;

    this.queue = [];

    if (queued.length > 0) {
      Y.applyUpdate(
        this.ydoc,
        queued.length === 1 ? queued[0] : Y.mergeUpdates(queued),
        REMOTE_ORIGIN,
      );
    }
  }

  /** Полная сверка хранилища с `Y.Doc` (тот же код, что для чужой правки). */
  resync(): void {
    this.pull();
  }

  /** Совпадает ли хранилище с проекцией (для тестов и отладки). */
  inSync(): boolean {
    if (!this.store) return true;

    const snapshot = this.snapshot();
    const dump = this.store.document.dump();
    const ids = Object.keys(snapshot.blocks);

    return (
      ids.length === Object.keys(dump).length &&
      ids.every((id) => dump[id] !== undefined && blockEquals(dump[id], snapshot.blocks[id]))
    );
  }

  destroy(): void {
    this.detach();
    clearTimeout(this.composeTimer);
    this.undoManager.destroy();
  }

  /** Хранилище -> Y.Doc: разница изменённых блоков одной транзакцией Yjs. */
  private push(ids: readonly BlockId[]): void {
    const store = this.store;

    if (!store) return;

    this.ydoc.transact(() => {
      const blocks = getBlocks(this.ydoc);
      const present: BaseBlock[] = [];
      const removed: BlockId[] = [];

      for (const id of ids) {
        const block = store.getBlock(id);

        if (block) present.push(block);
        else removed.push(id);
      }

      if (removed.length > 0) this.removeSubtrees(blocks, removed, store);

      for (const block of present) writeBlockData(blocks, block);

      const parents = new Set<BlockId>();

      for (const block of present) {
        parents.add(block.id);

        if (block.parentId) parents.add(block.parentId);
      }

      for (const parentId of parents) {
        const parent = store.getBlock(parentId);

        if (parent) reconcileChildren(blocks, parentId, parent.children);
      }
    }, COLLAB_ORIGIN);

    // Правило 4 проекции: если локальная правка создала то, что схема не допускает, у всех остальных проекция это
    // исправит, поэтому и здесь хранилище приводится к проекции.
    for (const id of ids) {
      const block = store.getBlock(id);

      // Смена типа блока может сделать недопустимыми его потомков, поэтому проверяются и они.
      const checked = block ? [block, ...store.getChildren(block.id)] : [];

      if (checked.some((item) => this.violatesSchema(store, item))) {
        this.pull();
        break;
      }
    }
  }

  private violatesSchema(store: DocumentStore, block: BaseBlock): boolean {
    if (!this.schema.hasBlock(block.flavour)) return false;

    const parent = block.parentId ? store.getBlock(block.parentId) : undefined;

    if (
      parent &&
      this.schema.hasBlock(parent.flavour) &&
      !this.schema.validateRelation(parent.flavour, block.flavour)
    ) {
      return true;
    }

    return !this.schema.validateProps(block.flavour, block.props).success;
  }

  /** Удаляет блоки и всех их потомков в `Y.Doc` (удаление выигрывает у правки внутри блока). */
  private removeSubtrees(
    blocks: Y.Map<YBlock>,
    ids: readonly BlockId[],
    store: DocumentStore,
  ): void {
    const childrenOf = new Map<BlockId, BlockId[]>();

    blocks.forEach((yblock, id) => {
      if (!(yblock instanceof Y.Map)) return;

      const place = readPlace(yblock.get('place'));

      if (!place?.p) return;

      const list = childrenOf.get(place.p);

      if (list) list.push(id);
      else childrenOf.set(place.p, [id]);
    });

    const stack = [...ids];

    while (stack.length > 0) {
      const id = stack.pop()!;

      // Потомок, который в хранилище ещё есть, перенесён в другое место: его не трогаем.
      if (!ids.includes(id) && store.getBlock(id)) continue;

      blocks.delete(id);
      stack.push(...(childrenOf.get(id) ?? []));
    }
  }

  /** Y.Doc -> хранилище: проекция, разница с хранилищем, применение. */
  private pull(): void {
    const store = this.store;

    if (!store || this.applying) return;

    try {
      const snapshot = this.snapshot();
      const dump = store.document.dump();
      const changes: Change[] = [];

      for (const block of Object.values(snapshot.blocks)) {
        const current = dump[block.id];

        if (!current || !blockEquals(current, block)) changes.push(new SetBlockChange(block));
      }

      for (const id of Object.keys(dump)) {
        if (!snapshot.blocks[id]) changes.push(new DeleteBlockChange(id));
      }

      if (changes.length === 0) return;

      this.applying = true;

      try {
        store.transact(
          (transaction) => {
            for (const change of changes) transaction.apply(change);
          },
          { history: false },
        );
      } finally {
        this.applying = false;
      }
    } catch (error) {
      this.applying = false;

      if (this.options.onError) this.options.onError(error);
      else throw error;
    }
  }
}

export function createCollab(options: CollabOptions): Collab {
  return new Collab(options);
}
