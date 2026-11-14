/**
 * Edits that were made but not yet acknowledged by the server. A `PendingStore` keeps them across page reloads and
 * crashes, so that nothing typed while offline (or just before closing the tab) is lost.
 *
 * Each edit is a record of its own: two tabs of the same user and document write different records, and an edit
 * that is sent twice is harmless because Yjs updates are idempotent.
 */
export interface StoredEdit {
  id: string;
  update: Uint8Array;
  touched: string[];
}

export interface PendingStore {
  /** All stored edits, oldest first. */
  list(): Promise<StoredEdit[]>;
  put(edit: StoredEdit): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

let counter = 0;

/** A new id; ids sort by creation time, so `list()` can return the edits in the order they were made. */
export function newEditId(): string {
  counter = (counter + 1) % 1_000_000;

  return `${Date.now().toString().padStart(15, '0')}-${counter.toString().padStart(6, '0')}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const byId = (a: StoredEdit, b: StoredEdit): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Keeps edits in memory only: for tests and for pages that do not need to survive a reload. */
export function memoryPendingStore(): PendingStore {
  const edits = new Map<string, StoredEdit>();

  return {
    list: () => Promise.resolve([...edits.values()].sort(byId)),
    put: (edit) => {
      edits.set(edit.id, edit);

      return Promise.resolve();
    },
    remove: (ids) => {
      for (const id of ids) edits.delete(id);

      return Promise.resolve();
    },
    clear: () => {
      edits.clear();

      return Promise.resolve();
    },
  };
}

export interface IndexedDbPendingStoreOptions {
  /**
   * Names one user's edits of one document, for example `${userId}:${documentId}`. Include the user: after another
   * person signs in on the same browser their edits must not be sent under the new person's name.
   */
  scope: string;
  /** Database name; every scope lives in the same database. */
  dbName?: string;
  /** The IndexedDB factory; `indexedDB` by default. */
  indexedDB?: IDBFactory;
}

const STORE = 'pending';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Keeps edits in IndexedDB. Call `clear()` when the user signs out. */
export function indexedDbPendingStore(options: IndexedDbPendingStoreOptions): PendingStore {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  const scope = options.scope;
  let database: Promise<IDBDatabase> | undefined;

  const open = (): Promise<IDBDatabase> => {
    database ??= new Promise((resolve, reject) => {
      const request = factory.open(options.dbName ?? 'inkbrick-collab', 1);

      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });

        store.createIndex('scope', 'scope');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(request.error ?? new Error('cannot open IndexedDB'));
      };
    });

    return database;
  };

  return {
    async list() {
      const db = await open();
      const records = await promisify(
        db.transaction(STORE).objectStore(STORE).index('scope').getAll(scope),
      );

      return (records as Array<StoredEdit & { scope: string }>)
        .map(({ id, update, touched }) => ({ id, update, touched }))
        .sort(byId);
    },

    async put(edit) {
      const db = await open();
      const transaction = db.transaction(STORE, 'readwrite');

      transaction.objectStore(STORE).put({ ...edit, scope });

      await finished(transaction);
    },

    async remove(ids) {
      if (ids.length === 0) return;

      const db = await open();
      const transaction = db.transaction(STORE, 'readwrite');

      for (const id of ids) transaction.objectStore(STORE).delete(id);

      await finished(transaction);
    },

    async clear() {
      const db = await open();
      const transaction = db.transaction(STORE, 'readwrite');
      const cursor = transaction.objectStore(STORE).index('scope').openKeyCursor(scope);

      cursor.onsuccess = () => {
        const position = cursor.result;

        if (!position) return;

        transaction.objectStore(STORE).delete(position.primaryKey);
        position.continue();
      };

      await finished(transaction);
    },
  };
}
