import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { layoutCursors, type CursorGeometry, type RemoteCursor } from './geometry';

export interface RemoteCursorsProps {
  /** Курсоры других людей в координатах модели; пересчитывайте при каждом изменении документа и присутствия. */
  readonly cursors: readonly RemoteCursor[];
}

/**
 * Чужие курсоры и выделения поверх документа. Это отдельный слой: чужой курсор не перерисовывает блоки текста.
 *
 * Разместите компонент внутри `EditorProvider` рядом с `DocumentView`, в контейнере с `position: relative`:
 * слой лежит в его левом верхнем углу и прокручивается вместе с документом. Положение измеряется по DOM, поэтому
 * слой пересчитывается при изменении документа, размера окна и документа.
 */
export function RemoteCursors({ cursors }: RemoteCursorsProps) {
  const editor = useEditor();
  const view = useEditorView();
  const layer = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const [geometry, setGeometry] = useState<CursorGeometry[]>([]);

  const measure = useCallback(() => {
    const root = view.getRoot();
    const element = layer.current;

    if (!root || !element) return;

    const origin = element.getBoundingClientRect();

    setGeometry(layoutCursors(root, { left: origin.left, top: origin.top }, cursors));
  }, [view, cursors]);

  // Свежие курсоры измеряются сразу после отрисовки, до показа: без мерцания в старом месте.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };
    const root = view.getRoot();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    const unsubscribe = editor.store.subscribe(schedule);

    if (root) observer?.observe(root);

    window.addEventListener('resize', schedule);
    void document.fonts?.ready.then(schedule);

    return () => {
      cancelAnimationFrame(frame.current);
      observer?.disconnect();
      unsubscribe();
      window.removeEventListener('resize', schedule);
    };
  }, [editor, view, measure]);

  return (
    <div ref={layer} data-inkbrick-ui="remote-cursors" aria-hidden="true">
      {geometry.map((item) => {
        const color = { '--inkbrick-remote-color': item.color } as CSSProperties;

        return (
          <div key={item.id} data-inkbrick-ui="remote-cursor" style={color}>
            {item.selection.map((box, index) => (
              <span
                key={index}
                data-inkbrick-part="remote-selection"
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
              />
            ))}
            {item.caret && (
              <span
                data-inkbrick-part="remote-caret"
                style={{
                  left: item.caret.left,
                  top: item.caret.top,
                  width: item.caret.width,
                  height: item.caret.height,
                }}
              >
                <span data-inkbrick-part="remote-flag">{item.name}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
