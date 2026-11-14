import * as Y from 'yjs';

import type { BlockId } from '@inkbrick/document';

import { getBlocks } from './format';

/** Точка в модели: блок и смещение в нём (в единицах UTF-16, как в `EditorSelection`). */
export interface SelectionPoint {
  blockId: BlockId;
  offset: number;
}

/**
 * Выделение для присутствия. Позиции хранятся как относительные позиции Yjs: чужая вставка перед кареткой не
 * сдвигает её «на глаз», у всех участников она остаётся между теми же символами.
 */
export interface SharedSelection {
  anchor: { block: BlockId; rel: unknown };
  head: { block: BlockId; rel: unknown };
}

/** Состояние присутствия, которое клиенты ставят через `connection.setAwareness`. */
export interface AwarenessState {
  name?: string;
  color?: string;
  selection?: SharedSelection;
}

/** Чужой курсор в координатах модели (структурно совместим с `RemoteCursor` из `@inkbrick/react`). */
export interface CursorInfo {
  id: number;
  name: string;
  color: string;
  head: SelectionPoint;
  anchor?: SelectionPoint;
}

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const FALLBACK_COLORS = ['#2f6fed', '#d9531e', '#1f9d6b', '#9b59d0', '#c4881a', '#d6336c'];
const MAX_NAME = 40;

export function shareSelection(
  ydoc: Y.Doc,
  selection: { anchor: SelectionPoint; head: SelectionPoint },
): SharedSelection | undefined {
  const encode = (point: SelectionPoint): SharedSelection['head'] | undefined => {
    const text = getBlocks(ydoc).get(point.blockId)?.get('text');

    if (!(text instanceof Y.Text)) return undefined;

    const offset = Math.max(0, Math.min(point.offset, text.length));

    return {
      block: point.blockId,
      rel: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, offset)),
    };
  };
  const anchor = encode(selection.anchor);
  const head = encode(selection.head);

  return anchor && head ? { anchor, head } : undefined;
}

/** Выделение другого участника. Состояние присутствия пришло от чужого клиента: любая ошибка формы даёт `undefined`. */
export function resolveSelection(
  ydoc: Y.Doc,
  shared: unknown,
): { anchor: SelectionPoint; head: SelectionPoint } | undefined {
  const decode = (value: unknown): SelectionPoint | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;

    const { block, rel } = value as { block?: unknown; rel?: unknown };

    if (typeof block !== 'string' || typeof rel !== 'object' || rel === null) return undefined;

    try {
      const absolute = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(rel),
        ydoc,
      );
      const owner = getBlocks(ydoc).get(block)?.get('text');

      if (!absolute || absolute.type !== owner || !(owner instanceof Y.Text)) return undefined;

      return { blockId: block, offset: absolute.index };
    } catch {
      return undefined;
    }
  };

  if (typeof shared !== 'object' || shared === null) return undefined;

  const anchor = decode((shared as SharedSelection).anchor);
  const head = decode((shared as SharedSelection).head);

  return anchor && head ? { anchor, head } : undefined;
}

/**
 * Курсоры людей из списка присутствия. Имя и цвет берутся из их состояния, но проверяются: цвет только вида `#rgb`,
 * имя короче 40 символов; иначе имя пользователя и цвет по его номеру. Люди без выделения в список не попадают.
 */
export function cursorsOf(
  ydoc: Y.Doc,
  peers: ReadonlyArray<{ conn: number; user: { id: number; username: string }; state: unknown }>,
): CursorInfo[] {
  const cursors: CursorInfo[] = [];

  for (const peer of peers) {
    const state = (
      typeof peer.state === 'object' && peer.state !== null ? peer.state : {}
    ) as AwarenessState;
    const selection = resolveSelection(ydoc, state.selection);

    if (!selection) continue;

    const name =
      typeof state.name === 'string' && state.name.length > 0 && state.name.length <= MAX_NAME
        ? state.name
        : peer.user.username;
    const color =
      typeof state.color === 'string' && COLOR.test(state.color)
        ? state.color
        : FALLBACK_COLORS[peer.user.id % FALLBACK_COLORS.length];

    cursors.push({ id: peer.conn, name, color, head: selection.head, anchor: selection.anchor });
  }

  return cursors;
}
