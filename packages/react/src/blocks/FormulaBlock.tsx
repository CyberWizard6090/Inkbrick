import { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_FORMULA_LENGTH } from '@inkbrick/document';

import { useT } from '../hooks/useT';
import { LazyFormulaPalette } from '../formula/LazyFormulaPalette';
import { useSnippetInsert } from '../formula/snippet';
import { FormulaView } from '../math/FormulaView';
import type { BlockViewProps } from '../ui/types';

/**
 * Формула отдельной строкой. Блок без редактируемого текста («остров»): код LaTeX хранится в `props.latex`,
 * а правится в собственном поле. Клик по формуле открывает поле; `Ctrl/Cmd+Enter` или потеря фокуса применяют код,
 * `Esc` отменяет. Пустой блок сразу открывается для ввода.
 */
export function FormulaBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const t = useT();
  const latex = typeof block.props.latex === 'string' ? block.props.latex : '';
  const [editing, setEditing] = useState(latex === '' && !readOnly);
  const [draft, setDraft] = useState(latex);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const insertSnippet = useSnippetInsert(field, draft, setDraft);
  // Escape отменяет ввод, а blur после него не должен сохранить набранное.
  const cancelled = useRef(false);
  const born = useRef(Date.now());

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  useEffect(() => {
    if (!editing) return;

    // После Esc поле удаляется, а blur при удалении шлёт не каждый браузер (Firefox — нет): флаг сбрасываем здесь.
    cancelled.current = false;
    // Окно «фокус отняли программно» отсчитывается от установки фокуса, а не от отрисовки: на медленной машине
    // отрисовка нового блока сама может занять больше этого окна.
    born.current = Date.now();
    field.current?.focus();

    // Сразу после создания блока редактор переносит курсор в следующий блок и забирает фокус: возвращаем его в поле.
    const timer = setTimeout(() => {
      if (Date.now() - born.current < 300) field.current?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [editing]);

  useEffect(() => {
    if (readOnly) setEditing(false);
  }, [readOnly]);

  const settle = useCallback((state: 'ready' | 'error', message?: string) => {
    setError(state === 'error' ? (message ?? '') : null);
  }, []);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }

    // Блок только что создан и пуст: фокус отняли программно (курсор перенесён дальше) — поле остаётся открытым.
    if (latex === '' && draft === '' && Date.now() - born.current < 300) {
      setTimeout(() => field.current?.focus(), 0);
      return;
    }

    if (draft !== latex) {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: block.id, props: { latex: draft } },
      });
    }

    setEditing(false);
  };

  const cancel = () => {
    cancelled.current = true;
    setDraft(latex);
    setEditing(false);
  };

  return (
    <div
      className="block block-formula"
      data-inkbrick-block="formula"
      data-block-id={block.id}
      data-selected={selected || undefined}
      contentEditable={false}
    >
      {editing ? (
        <div
          ref={container}
          className="formula-editor"
          data-inkbrick-part="formula-editor"
          // Поле закрывается, когда фокус ушёл из редактора целиком; переход на кнопки палитры его не закрывает.
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              container.current?.contains(event.relatedTarget)
            )
              return;

            commit();
          }}
        >
          <textarea
            ref={field}
            className="formula-source"
            data-inkbrick-part="formula-source"
            aria-label={t('formula.source')}
            aria-invalid={error !== null || undefined}
            placeholder={t('formula.placeholder')}
            spellCheck={false}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            maxLength={MAX_FORMULA_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
                (event.target as HTMLTextAreaElement).blur();
              } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                (event.target as HTMLTextAreaElement).blur();
              }
            }}
          />
          <div className="formula-preview" data-inkbrick-part="formula-preview">
            <FormulaView latex={draft} display showError onSettled={settle} />
          </div>
          <LazyFormulaPalette onInsert={insertSnippet} />
          <div className="formula-hint" data-inkbrick-part="formula-hint">
            {t('formula.hint')}
          </div>
        </div>
      ) : latex === '' ? (
        <button
          type="button"
          className="formula-empty"
          data-inkbrick-part="formula-empty"
          disabled={readOnly}
          onClick={() => setEditing(true)}
        >
          {t('formula.empty')}
        </button>
      ) : (
        <div
          className="formula-display"
          data-inkbrick-part="formula-display"
          role={readOnly ? undefined : 'button'}
          tabIndex={readOnly ? undefined : 0}
          aria-label={readOnly ? undefined : t('formula.edit')}
          title={readOnly ? undefined : t('formula.edit')}
          onClick={() => !readOnly && setEditing(true)}
          onKeyDown={(event) => {
            if (!readOnly && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              setEditing(true);
            }
          }}
        >
          <FormulaView latex={latex} display showError />
        </div>
      )}
    </div>
  );
}
