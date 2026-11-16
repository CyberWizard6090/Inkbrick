import type { BlockProps } from '../blocks/BlockProps';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { useHeadings } from './useHeadings';

const LEVELS = [1, 2, 3, 4, 5, 6];

/**
 * Оглавление: заголовки документа ссылками. Нажатие переносит курсор в заголовок и прокручивает к нему.
 * Список собирается из документа при каждой правке, поэтому всегда актуален; в документе хранится только `maxLevel`.
 */
export function TocBlock({ block, selected, readOnly }: BlockProps) {
  const editor = useEditor();
  const t = useT();
  const view = useEditorView();
  const raw = block.props.maxLevel;
  const maxLevel = typeof raw === 'number' && raw >= 1 && raw <= 6 ? Math.trunc(raw) : 6;
  const headings = useHeadings(maxLevel);

  const open = (id: string) => {
    view.placeCaret(id, 0);
    requestAnimationFrame(() => view.getElement(id)?.scrollIntoView?.({ block: 'start' }));
  };

  const cycle = () =>
    editor.dispatch({
      type: 'setBlockProps',
      payload: {
        blockId: block.id,
        props: { maxLevel: LEVELS[maxLevel % LEVELS.length] },
      },
    });

  return (
    <nav
      className="block block-toc"
      data-inkbrick-block="toc"
      data-block-id={block.id}
      data-selected={selected || undefined}
      aria-label={t('toc.label')}
      contentEditable={false}
    >
      {headings.length === 0 ? (
        <p data-inkbrick-part="empty">{t('toc.empty')}</p>
      ) : (
        <ul>
          {headings.map((heading) => (
            <li
              key={heading.id}
              data-level={heading.level}
              style={{ marginInlineStart: heading.depth * 16 }}
            >
              <button
                type="button"
                data-inkbrick-part="link"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => open(heading.id)}
              >
                {heading.text || '…'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <button
          type="button"
          data-inkbrick-part="levels"
          aria-label={t('toc.levels')}
          title={t('toc.levels')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={cycle}
        >
          {maxLevel === 1 ? 'H1' : `H1–H${maxLevel}`}
        </button>
      )}
    </nav>
  );
}
