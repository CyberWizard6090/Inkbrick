import { serializeDocument } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { SandboxMessage } from './i18n';
import { createSandboxEditor, createSandboxSchema, parseSnapshot } from './sandboxEditor';

const DB_NAME = 'inkbrick-sandbox';
const STORE = 'documents';
const DOCUMENT_KEY = 'document';
const KEY_PREFIX = 'inkbrick-sandbox-';

/** Сохраняем после паузы в правках; у большого документа пауза длиннее: сериализация 50 000 блоков заметна. */
const SAVE_DELAY_MS = 400;
const LARGE_SAVE_DELAY_MS = 2000;
const LARGE_DOCUMENT = 5000;

let disabled = false;

/**
 * Сохранение включено по умолчанию. Автоматические тесты (`navigator.webdriver`) стартуют с чистого документа,
 * поэтому для них оно выключено; `?persist=1` и `?persist=0` задают режим явно.
 */
export function persistenceEnabled(): boolean {
  const param = new URLSearchParams(window.location.search).get('persist');

  if (param === '1') return true;
  if (param === '0') return false;

  return !navigator.webdriver;
}

// Документ лежит в IndexedDB, а не в localStorage: тот вмещает около 5 МБ, а 50 000 блоков — десятки мегабайт.
let connection: Promise<IDBDatabase | null> | undefined;

function open(): Promise<IDBDatabase | null> {
  connection ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      // IndexedDB недоступна (приватный режим): документ просто не запоминается
      resolve(null);
    }
  });

  return connection;
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await open();

  if (!db) return undefined;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));

      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => resolve(undefined);
      transaction.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const writeStoredDocument = (value: unknown) =>
  run('readwrite', (store) => store.put(value, DOCUMENT_KEY));

const removeStoredDocument = () => run('readwrite', (store) => store.delete(DOCUMENT_KEY));

export async function saveDocument(editor: Editor): Promise<void> {
  if (disabled || !persistenceEnabled()) return;

  await writeStoredDocument(serializeDocument(editor.document, editor.schema));
}

export interface RestoredEditor {
  editor: Editor;
  notice?: SandboxMessage;
}

export async function restoreEditor(): Promise<RestoredEditor> {
  const stored = persistenceEnabled()
    ? await run('readonly', (store) => store.get(DOCUMENT_KEY))
    : undefined;

  if (stored === undefined) return { editor: createSandboxEditor() };

  const schema = createSandboxSchema();

  try {
    const { document, fixes } = parseSnapshot(stored, schema);

    return {
      editor: createSandboxEditor(schema, document),
      notice:
        fixes.length > 0
          ? { key: 'notice.restoredFixed', params: { count: fixes.length } }
          : undefined,
    };
  } catch {
    await removeStoredDocument();

    return { editor: createSandboxEditor(), notice: { key: 'notice.restoreFailed' } };
  }
}

export function startAutosave(editor: Editor): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let large = false;

  const flush = () => {
    if (timer === undefined) return;

    clearTimeout(timer);
    timer = undefined;
    large = Object.keys(editor.document.dump()).length > LARGE_DOCUMENT;
    void saveDocument(editor);
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const unsubscribe = editor.store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(flush, large ? LARGE_SAVE_DELAY_MS : SAVE_DELAY_MS);
  });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    unsubscribe();
    clearTimeout(timer);
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export async function clearSandboxStorage(): Promise<void> {
  disabled = true;

  const db = await open();

  db?.close();
  connection = undefined;

  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });

  try {
    const keys: string[] = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);

      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }

    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // localStorage недоступен: удалять нечего
  }
}

export function downloadDocument(editor: Editor): void {
  const json = JSON.stringify(serializeDocument(editor.document, editor.schema), null, 2);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const link = document.createElement('a');

  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = `inkbrick-document-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
