import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';

import { MAX_COLUMNS, type ColumnsProps } from '@inkbrick/document';
import type { CaretResult } from '@inkbrick/engine';

import type { BlockProps } from '../blocks/BlockProps';
import { BlockChildren } from '../blocks/BlockChildren';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { ColumnsContext, type ColumnsLayout } from './ColumnsContext';

const MIN_SHARE = 0.08;
const KEY_STEP = 0.03;

/** Доли ширины колонок для отрисовки: недостающие — поровну. */
function sharesOf(ratios: readonly number[] | undefined, count: number): number[] {
  const known = (ratios ?? []).filter((value) => value > 0);
  const fill = known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : 1;
  const shares = Array.from({ length: count }, (_, index) => ratios?.[index] ?? fill);
  const total = shares.reduce((sum, value) => sum + value, 0);

  return shares.map((value) => value / total);
}

/**
 * Колонки: сетка из колонок с разделителями. Разделитель между колонками тянется мышью (предпросмотр сразу, в историю — один
 * шаг при отпускании) или стрелками. Справа сверху при наведении — кнопки «добавить колонку», «убрать последнюю» и «развернуть
 * в обычные блоки».
 */
export function ColumnsBlock({ block, selected, readOnly }: BlockProps) {
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  const grid = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number[] | null>(null);
  const { ratios } = block.props as ColumnsProps;
  const ids = block.children;
  const shares = preview ?? sharesOf(ratios, ids.length);

  const run = (type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: block.id, ...payload } } as never) as
      CaretResult | undefined;

  const perform = (action: () => CaretResult | undefined) => {
    let caret: CaretResult | undefined;

    editor.sealHistory();
    flushSync(() => {
      caret = action();
    });

    if (caret && view.getElement(caret.blockId)) view.placeCaret(caret.blockId, caret.offset);
  };

  const widths = () =>
    ids.map(
      (id) =>
        grid.current
          ?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
          ?.getBoundingClientRect().width ?? 0,
    );

  const resized = (index: number, delta: number, base: readonly number[]): number[] | null => {
    const total = base.reduce((sum, value) => sum + value, 0);

    if (total <= 0) return null;

    const pair = base[index] + base[index + 1];
    const left = Math.min(Math.max(base[index] + delta, pair * 0), pair);
    const min = total * MIN_SHARE;
    const next = [...base];

    next[index] = Math.min(Math.max(left, min), pair - min);
    next[index + 1] = pair - next[index];

    return next.map((value) => value / total);
  };

  const onDrag = (index: number, start: PointerEvent | { clientX: number }) => {
    const base = widths();
    const startX = start.clientX;
    let latest: number[] | null = null;

    const move = (event: PointerEvent) => {
      latest = resized(index, event.clientX - startX, base);

      if (latest) setPreview(latest);
    };
    const finish = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);

      flushSync(() => {
        if (latest) {
          editor.sealHistory();
          run('setColumnRatios', { ratios: latest });
        }

        setPreview(null);
      });
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };

  const onKey = (index: number, delta: number) => {
    const base = widths();
    const total = base.reduce((sum, value) => sum + value, 0);
    const next = resized(index, delta * KEY_STEP * total, base);

    if (next) {
      editor.sealHistory();
      run('setColumnRatios', { ratios: next });
    }
  };

  const latest = useRef({ onDrag, onKey });

  latest.current = { onDrag, onKey };

  const sharesKey = shares.join(',');
  const stableShares = useMemo(() => shares, [sharesKey]);

  const layout = useMemo<ColumnsLayout>(
    () => ({
      ids,
      shares: stableShares,
      onDrag: (index, event) => latest.current.onDrag(index, event),
      onKey: (index, delta) => latest.current.onKey(index, delta),
      readOnly: readOnly === true,
    }),
    [ids, stableShares, readOnly],
  );

  const template = shares.map((share) => `minmax(0, ${share}fr)`).join(' ');

  return (
    <div
      className="block block-columns"
      data-inkbrick-block="columns"
      data-block-id={block.id}
      data-selected={selected || undefined}
      style={{ '--inkbrick-columns': template } as CSSProperties}
    >
      <div ref={grid} data-inkbrick-part="grid">
        <ColumnsContext.Provider value={layout}>
          <BlockChildren id={block.id} />
        </ColumnsContext.Provider>
      </div>
      {!readOnly && (
        <div data-inkbrick-part="toolbar" contentEditable={false}>
          <button
            type="button"
            aria-label={t('columns.add')}
            title={t('columns.add')}
            disabled={ids.length >= MAX_COLUMNS}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => perform(() => run('addColumn', { index: ids.length }))}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            aria-label={t('columns.remove')}
            title={t('columns.remove')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => perform(() => run('removeColumn', { index: ids.length - 1 }))}
          >
            <Icon name="trash" />
          </button>
          <button
            type="button"
            aria-label={t('columns.unwrap')}
            title={t('columns.unwrap')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => perform(() => run('unwrapColumns', {}))}
          >
            <Icon name="replace" />
          </button>
        </div>
      )}
    </div>
  );
}
