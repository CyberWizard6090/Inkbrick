import { useState } from 'react';

import type { MessageKey } from '../i18n/en';
import { useT } from '../hooks/useT';
import { CARET } from './snippet';
import { SYMBOL_CATEGORIES, type SymbolCategoryId } from './symbols';

export interface FormulaPaletteProps {
  readonly onInsert: (snippet: string) => void;
}

/**
 * Палитра математических символов и шаблонов: вкладки по категориям (функции, структуры, греческие буквы, операторы,
 * отношения, стрелки, множества) и сетка кнопок. Нажатие вставляет код LaTeX в поле формулы; фокус из поля не уходит.
 * Атрибуты: `data-inkbrick-part="formula-palette"`, `formula-palette-tabs`, `formula-palette-grid`, `formula-symbol`.
 */
export function FormulaPalette({ onInsert }: FormulaPaletteProps) {
  const t = useT();
  const [active, setActive] = useState<SymbolCategoryId>('functions');
  const category = SYMBOL_CATEGORIES.find((item) => item.id === active) ?? SYMBOL_CATEGORIES[0];
  const name = (id: SymbolCategoryId) => t(`formula.palette.${id}` as MessageKey);

  return (
    <div
      className="formula-palette"
      data-inkbrick-part="formula-palette"
      role="group"
      aria-label={t('formula.palette.label')}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className="formula-palette__tabs"
        data-inkbrick-part="formula-palette-tabs"
        role="tablist"
      >
        {SYMBOL_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-inkbrick-part="formula-palette-tab"
            data-category={item.id}
            data-active={item.id === active || undefined}
            aria-selected={item.id === active}
            aria-label={name(item.id)}
            title={name(item.id)}
            onClick={() => setActive(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <div
        className="formula-palette__grid"
        data-inkbrick-part="formula-palette-grid"
        role="tabpanel"
        aria-label={name(category.id)}
      >
        {category.items.map((item) => {
          const code = item.title ?? item.snippet.split(CARET).join('').trim();

          return (
            <button
              key={item.snippet}
              type="button"
              data-inkbrick-part="formula-symbol"
              data-snippet={item.snippet}
              aria-label={code}
              title={code}
              onClick={() => onInsert(item.snippet)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
