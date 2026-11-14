import * as Y from 'yjs';

import { deepEqual } from './equal';
import { normalizeInlineNodes, type InlineNode, type TextAttributes } from '@inkbrick/document';

type Attrs = Record<string, unknown>;

/** Атрибуты без снятых значений: Yjs хранит снятый атрибут как `null`, модель Inkbrick его не знает. */
export function cleanAttrs(attrs: Attrs | null | undefined): TextAttributes | undefined {
  if (!attrs) return undefined;

  const out: Attrs = {};

  for (const key of Object.keys(attrs)) {
    const value = attrs[key];

    if (value !== undefined && value !== null) out[key] = value;
  }

  return Object.keys(out).length > 0 ? (out as TextAttributes) : undefined;
}

/** `Y.Text` в узлы модели. `toDelta()` может вернуть соседние отрезки с одинаковыми атрибутами, поэтому узлы нормализуются. */
export function readInline(text: Y.Text): InlineNode[] {
  const nodes: InlineNode[] = [];

  for (const op of text.toDelta() as Array<{ insert: unknown; attributes?: Attrs }>) {
    if (typeof op.insert !== 'string') continue;

    const attributes = cleanAttrs(op.attributes);

    nodes.push(attributes ? { insert: op.insert, attributes } : { insert: op.insert });
  }

  return normalizeInlineNodes(nodes);
}

const plain = (nodes: readonly InlineNode[]): string => nodes.map((node) => node.insert).join('');

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

interface Run {
  from: number;
  to: number;
  attrs: TextAttributes;
}

function toRuns(nodes: readonly InlineNode[]): Run[] {
  const runs: Run[] = [];
  let offset = 0;

  for (const node of nodes) {
    runs.push({ from: offset, to: offset + node.insert.length, attrs: node.attributes ?? {} });
    offset += node.insert.length;
  }

  return runs;
}

function runAt(runs: readonly Run[], index: number): TextAttributes {
  for (const run of runs) {
    if (index >= run.from && index < run.to) return run.attrs;
  }

  return {};
}

/**
 * Приводит `Y.Text` к `content` минимальной правкой.
 *
 *  1. Общий префикс и суффикс по тексту; середина — одно удаление и одна вставка.
 *  2. Границы не попадают внутрь суррогатной пары: иначе Yjs заменит половинки на U+FFFD у той реплики, которая её
 *     разорвала, и реплики разойдутся.
 *  3. Вставка передаёт полный набор атрибутов (снятые — `null`): без этого Yjs наследует атрибуты соседа.
 *  4. Во всём тексте атрибуты сравниваются по отрезкам; отличия пишутся `text.format`.
 */
export function applyContent(text: Y.Text, content: readonly InlineNode[]): void {
  const target = normalizeInlineNodes(
    content.map((node) => {
      const attributes = cleanAttrs(node.attributes);

      return attributes ? { insert: node.insert, attributes } : { insert: node.insert };
    }),
  );
  const current = readInline(text);
  const before = plain(current);
  const after = plain(target);

  if (before !== after) {
    const limit = Math.min(before.length, after.length);
    let prefix = 0;

    while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;

    if (prefix > 0 && isHighSurrogate(before.charCodeAt(prefix - 1))) prefix--;

    let suffix = 0;

    while (
      suffix < limit - prefix &&
      before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
    ) {
      suffix++;
    }

    if (suffix > 0 && isLowSurrogate(before.charCodeAt(before.length - suffix))) suffix--;

    const removed = before.length - prefix - suffix;

    if (removed > 0) text.delete(prefix, removed);

    const insertEnd = after.length - suffix;

    if (insertEnd > prefix) {
      const keys = new Set<string>();

      for (const node of [...current, ...target]) {
        for (const key of Object.keys(node.attributes ?? {})) keys.add(key);
      }

      let cursor = prefix;

      for (const run of toRuns(target)) {
        const from = Math.max(run.from, prefix);
        const to = Math.min(run.to, insertEnd);

        if (to <= from) continue;

        const full: Attrs = {};

        for (const key of keys) full[key] = (run.attrs as Attrs)[key] ?? null;

        text.insert(cursor, after.slice(from, to), full);
        cursor += to - from;
      }
    }
  }

  const actual = toRuns(readInline(text));
  const expected = toRuns(target);
  const cuts = new Set<number>([0, after.length]);

  for (const run of [...actual, ...expected]) {
    cuts.add(run.from);
    cuts.add(run.to);
  }

  const points = [...cuts].filter((cut) => cut <= after.length).sort((a, b) => a - b);

  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i];
    const to = points[i + 1];
    const want = runAt(expected, from) as Attrs;
    const have = runAt(actual, from) as Attrs;
    const change: Attrs = {};

    for (const key of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (want[key] !== have[key]) change[key] = want[key] ?? null;
    }

    if (Object.keys(change).length > 0) text.format(from, to - from, change);
  }
}

/** Равенство содержимого после нормализации; порядок ключей атрибутов не важен. */
export function inlineEquals(a: readonly InlineNode[], b: readonly InlineNode[]): boolean {
  return deepEqual(normalizeInlineNodes([...a]), normalizeInlineNodes([...b]));
}
