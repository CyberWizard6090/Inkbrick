import * as Y from 'yjs';

import type { BlockId } from '@inkbrick/document';

/** Формат документа в Yjs: `inkbrick-yjs`, версия 1 (пока не заморожен, см. docs/collab.md). */
export const FORMAT_VERSION = 1;

/** Метка транзакций моста: по ней мост отличает свои записи от чужих. */
export const COLLAB_ORIGIN = Symbol('inkbrick-collab');

export interface Place {
  /** Родитель; у корня `null`. */
  p: BlockId | null;
  /** Ключ порядка среди потомков родителя. */
  k: string;
}

export type YBlock = Y.Map<unknown>;

export const getMeta = (ydoc: Y.Doc): Y.Map<unknown> => ydoc.getMap('meta');

export const getBlocks = (ydoc: Y.Doc): Y.Map<YBlock> => ydoc.getMap('blocks');

export const isInitialized = (ydoc: Y.Doc): boolean =>
  getMeta(ydoc).get('format') === FORMAT_VERSION;

export function readRootId(ydoc: Y.Doc): BlockId {
  const rootId = getMeta(ydoc).get('rootId');

  if (typeof rootId !== 'string') {
    throw new Error('Y.Doc is not an inkbrick-yjs document: it has no meta.rootId');
  }

  return rootId;
}

export function readPlace(value: unknown): Place | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const { p, k } = value as { p?: unknown; k?: unknown };

  if (typeof k !== 'string' || (p !== null && typeof p !== 'string')) return undefined;

  return { p: p as BlockId | null, k };
}
