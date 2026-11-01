import { useEffect, useRef, useState, type ElementType } from 'react';

import { useEditorUI } from '../ui/EditorUIContext';
import { ensureMathStyles, mountFormula } from './renderer';

export interface FormulaViewProps {
  readonly latex: string;
  readonly display?: boolean;
  readonly showError?: boolean;
  readonly onSettled?: (state: 'ready' | 'error', message?: string) => void;
}

/**
 * Формула, нарисованная выбранным в `EditorProvider` подсчётчиком (по умолчанию Temml → MathML). Пока считается и при
 * ошибке виден исходный код. Атрибуты: `data-inkbrick-part="formula-render"`, `data-state="empty|source|loading|ready|error"`.
 */
export function FormulaView({
  latex,
  display = false,
  showError = false,
  onSettled,
}: FormulaViewProps) {
  const { formulaRenderer } = useEditorUI();
  const ref = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const Tag: ElementType = display ? 'div' : 'span';

  useEffect(() => {
    const target = ref.current;

    if (!target) return;

    ensureMathStyles(globalThis.document);
    setError(null);

    return mountFormula(target, latex, {
      display,
      renderer: formulaRenderer,
      onSettled: (state, message) => {
        setError(state === 'error' ? (message ?? '') : null);
        onSettled?.(state, message);
      },
    });
  }, [latex, display, formulaRenderer, onSettled]);

  return (
    <>
      <Tag
        ref={(node: HTMLElement | null) => {
          ref.current = node;
        }}
        data-inkbrick-part="formula-render"
        data-display={display || undefined}
      />
      {showError && error !== null && (
        <span data-inkbrick-part="formula-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
