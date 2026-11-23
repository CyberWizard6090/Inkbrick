import type { CSSProperties } from 'react';

import { safeCssColor } from '@inkbrick/document';

import { Icon } from '../icons/Icon';
import { CustomColorButton } from './CustomColorSwatch';

export interface ColorSwatchesProps {
  /** Подпись группы для программ чтения с экрана. */
  readonly label: string;
  /** Имена цветов палитры по порядку. */
  readonly names: readonly string[];
  /** Выбранный сейчас цвет: имя, свой `#rrggbb[aa]` или `null` / `undefined` — цвета нет. */
  readonly current: string | null | undefined;
  /** CSS-цвет образца: тот, что ляжет на текст, фон или линию (`var(--inkbrick-highlight-blue)`). */
  colorOf(name: string): string;
  /** Название цвета на языке редактора (подпись и подсказка образца). */
  nameOf(name: string): string;
  /** `text` — образец «A» этого цвета на обычном фоне (цвет текста); `fill` — образец залит цветом (по умолчанию). */
  readonly sample?: 'fill' | 'text';
  /** Подпись первого образца «×», который снимает цвет. */
  readonly resetLabel: string;
  /** Подпись последнего образца «Свой цвет…». Без `custom` его нет. */
  readonly customLabel?: string;
  /** Свой цвет: с какого начинать и сколько цифр в результате (см. `CustomColorSwatch`). */
  readonly custom?: { readonly fallback: string; readonly alphaHex?: 'auto' | 'always' };
  /** `menuitemradio` внутри меню; на панелях роли нет. */
  readonly role?: 'menuitemradio';
  /** `data-action` образцов (для тестов и своих стилей): «×», цвета палитры и «Свой цвет…». */
  readonly actions?: {
    readonly reset: string;
    color(name: string): string;
    readonly custom?: string;
  };
  /** Повторный выбор применённого цвета снимает его (как на панели форматирования). */
  readonly toggle?: boolean;
  /** Столбцов в сетке (по умолчанию 8). */
  readonly columns?: number;
  /** Выбран цвет: имя, свой hex или `null` — «×». */
  onPick(color: string | null): void;
}

/**
 * Палитра цветов одного вида для всего редактора: сетка скруглённых образцов — первый «×» (снять цвет), за ним цвета
 * палитры, — а под ней кнопка «+ Свой цвет…» (выбор цвета с прозрачностью открывается окошком рядом). Её используют панель
 * форматирования (цвет текста и выделение), меню блока (фон) и меню таблицы (фон ячеек и цвет границ).
 */
export function ColorSwatches({
  label,
  names,
  current,
  colorOf,
  nameOf,
  sample = 'fill',
  resetLabel,
  customLabel,
  custom,
  role,
  actions,
  toggle,
  columns = 8,
  onPick,
}: ColorSwatchesProps) {
  const checked = (on: boolean) =>
    role ? { 'aria-checked': on } : { 'data-pressed': on || undefined };
  // Свой цвет: значение не из палитры, но безопасное для `style` (иначе образец «Свой цвет…» не подсвечивается).
  const own =
    current !== null && current !== undefined && !names.includes(current)
      ? (safeCssColor(current) ?? undefined)
      : undefined;

  return (
    <div data-inkbrick-part="palette" role="group" aria-label={label}>
      <div
        data-inkbrick-part="swatches"
        data-sample={sample}
        style={{ '--inkbrick-swatch-columns': columns } as CSSProperties}
      >
        <button
          type="button"
          role={role}
          {...checked(current === null || current === undefined)}
          data-inkbrick-part="swatch"
          data-color=""
          data-action={actions?.reset}
          aria-label={resetLabel}
          title={resetLabel}
          onClick={() => onPick(null)}
        >
          <Icon name="x" />
        </button>
        {names.map((name) => (
          <button
            key={name}
            type="button"
            role={role}
            {...checked(current === name)}
            data-inkbrick-part="swatch"
            data-color={name}
            data-action={actions?.color(name)}
            aria-label={nameOf(name)}
            title={nameOf(name)}
            style={{ '--inkbrick-swatch': colorOf(name) } as CSSProperties}
            onClick={() => onPick(toggle && current === name ? null : name)}
          >
            {sample === 'text' ? 'A' : null}
          </button>
        ))}
      </div>
      {custom && customLabel && (
        <CustomColorButton
          role={role}
          action={actions?.custom}
          value={own}
          fallback={custom.fallback}
          alphaHex={custom.alphaHex}
          label={customLabel}
          pressed={own !== undefined}
          onPick={onPick}
        />
      )}
    </div>
  );
}
