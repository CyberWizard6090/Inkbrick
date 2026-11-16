import { useEffect, useState } from 'react';

import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { useHeadings } from './useHeadings';

export interface TocPanelProps {
  /** С какой стороны окна стоит панель. По умолчанию справа. */
  readonly side?: 'left' | 'right';
  /** Самый глубокий уровень заголовков в панели (1–6). По умолчанию 6. */
  readonly maxLevel?: number;
  /** Подпись для чтения с экрана; по умолчанию «На этой странице» (отличается от блока оглавления, чтобы имена не совпадали). */
  readonly label?: string;
  readonly className?: string;
}

/** Заголовок считается текущим, когда его верх поднялся выше этой линии от верха окна. */
const LINE = 120;

/**
 * Панель оглавления сбоку от документа: заголовки ссылками, текущий раздел подсвечен и меняется при прокрутке. Нажатие
 * переносит курсор в заголовок и прокручивает к нему. Панель висит у края окна (`position: fixed`), на узком окне (меньше
 * 1100 px) скрыта; без заголовков не показывается. Кладётся в `<EditorProvider>` рядом с документом.
 *
 * ```tsx
 * <EditorProvider editor={editor}>
 *   <DocumentView />
 *   <TocPanel side="right" maxLevel={3} />
 * </EditorProvider>
 * ```
 */
export function TocPanel({ side = 'right', maxLevel = 6, label, className }: TocPanelProps) {
  const view = useEditorView();
  const t = useT();
  const headings = useHeadings(Math.min(6, Math.max(1, Math.trunc(maxLevel))));
  const [active, setActive] = useState<string | null>(null);

  // Текущий заголовок — последний выше линии. Блоки вне окна виртуального рендерера в DOM не стоят: первый
  // отрисованный заголовок ниже линии говорит, что текущий — тот, что перед ним.
  useEffect(() => {
    if (headings.length === 0) return;

    let frame = 0;

    const measure = () => {
      frame = 0;

      let current = 0;

      for (let i = 0; i < headings.length; i++) {
        const element = view.getElement(headings[i].id);

        if (!element) continue;

        if (element.getBoundingClientRect().top > LINE) {
          current = Math.max(0, i - 1);
          setActive(headings[current].id);

          return;
        }

        current = i;
      }

      setActive(headings[current].id);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    later();
    window.addEventListener('scroll', later, { capture: true, passive: true });
    window.addEventListener('resize', later);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', later);
    };
  }, [headings, view]);

  if (headings.length === 0) return null;

  const open = (id: string) => {
    view.placeCaret(id, 0);
    requestAnimationFrame(() => view.getElement(id)?.scrollIntoView?.({ block: 'start' }));
  };

  return (
    <nav
      className={className ? `inkbrick-toc-panel ${className}` : 'inkbrick-toc-panel'}
      data-inkbrick-ui="toc-panel"
      data-testid="toc-panel"
      data-side={side}
      aria-label={label ?? t('toc.panel')}
    >
      <ul>
        {headings.map((heading) => (
          <li
            key={heading.id}
            data-level={heading.level}
            data-active={heading.id === active || undefined}
            style={{ marginInlineStart: heading.depth * 12 }}
          >
            <button
              type="button"
              data-inkbrick-part="link"
              aria-current={heading.id === active ? 'location' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => open(heading.id)}
            >
              {heading.text || '…'}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
