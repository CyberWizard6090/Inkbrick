import type { Document } from '@inkbrick/document';
import { DocumentStore, type DocumentStoreOptions } from './document-store';

export interface CreateStoreOptions extends DocumentStoreOptions {
  document: Document;
}

export function createStore(options: CreateStoreOptions): DocumentStore {
  return new DocumentStore(options.document, { history: options.history, meta: options.meta });
}
