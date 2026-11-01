import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import { MAX_FORMULA_LENGTH } from '@inkbrick/document';

import type { EditorView } from '../editing/EditorView';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { FormulaView } from '../math/FormulaView';
import { applyInlineFormula } from './actions';
import { LazyFormulaPalette } from './LazyFormulaPalette';
import { useSnippetInsert } from './snippet';
import type { FormulaEditorState } from './FormulaController';

const WIDTH = 340;

function close(view: EditorView, state: FormulaEditorState) {
  view.formula.close();
  view.placeSelection(
    { blockId: state.blockId, offset: state.mode === 'edit' ? state.to : state.from },
    { blockId: state.blockId, offset: state.to },
  );
}

function Body({ state }: { state: FormulaEditorState }) {
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  const [draft, setDraft] = useState(state.latex);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const insertSnippet = useSnippetInsert(field, draft, setDraft);

  const settle = useCallback((result: 'ready' | 'error') => setError(result === 'error'), []);
  const width = Math.min(WIDTH, window.innerWidth - 16);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const below = state.position.y + 8;

    setTop(
      below + height > window.innerHeight && state.position.top - height - 8 > 0
        ? state.position.top - height - 8
        : below,
    );
  }, [state.position.y, state.position.top, draft]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;

      close(view, state);
    };

    document.addEventListener('pointerdown', onPointerDown, true);

    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [view, state]);

  const apply = () => {
    if (applyInlineFormula(editor, view, state, draft)) view.formula.close();
  };

  const remove = () => {
    if (applyInlineFormula(editor, view, state, '')) view.formula.close();
  };

  return (
    <div
      ref={ref}
      className="formula-popover"
      data-inkbrick-ui="formula-popover"
      data-testid="formula-popover"
      role="dialog"
      aria-label={t('formula.inline.title')}
      style={{
        left: Math.max(8, Math.min(state.position.x - width / 2, window.innerWidth - width - 8)),
        top: top ?? state.position.y + 8,
        width,
      }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault();
      }}
    >
      <textarea
        ref={field}
        className="formula-popover__source"
        data-inkbrick-part="formula-source"
        aria-label={t('formula.source')}
        aria-invalid={error || undefined}
        placeholder={t('formula.placeholder')}
        spellCheck={false}
        rows={2}
        maxLength={MAX_FORMULA_LENGTH}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close(view, state);
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            apply();
          }
        }}
      />
      <div className="formula-popover__preview" data-inkbrick-part="formula-preview">
        <FormulaView latex={draft} showError onSettled={settle} />
      </div>
      <LazyFormulaPalette onInsert={insertSnippet} />
      <div className="formula-popover__actions" data-inkbrick-part="formula-actions">
        {state.mode === 'edit' && (
          <button
            type="button"
            data-inkbrick-part="button"
            data-danger=""
            data-action="remove"
            aria-label={t('formula.remove')}
            title={t('formula.remove')}
            onClick={remove}
          >
            <Icon name="trash" />
          </button>
        )}
        <span className="formula-popover__spacer" />
        <button
          type="button"
          data-inkbrick-part="button"
          data-action="cancel"
          onClick={() => close(view, state)}
        >
          {t('formula.cancel')}
        </button>
        <button
          type="button"
          data-inkbrick-part="button"
          data-primary=""
          data-action="apply"
          disabled={state.mode === 'insert' && draft.trim() === ''}
          onClick={apply}
        >
          {t('formula.apply')}
        </button>
      </div>
    </div>
  );
}

export function FormulaPopover() {
  const view = useEditorView();
  const readOnly = useReadOnly();
  const state = useSyncExternalStore(
    view.formula.subscribe,
    view.formula.getState,
    view.formula.getState,
  );

  if (!state.open || readOnly || typeof document === 'undefined') return null;

  return createPortal(
    <Body key={`${state.mode}:${state.blockId}:${state.from}:${state.to}`} state={state} />,
    document.body,
  );
}
