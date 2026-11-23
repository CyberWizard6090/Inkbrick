import { el } from '../shared/dom';
import { formatHex, hsvToRgb, parseColor, rgbToHsv, type Hsva } from './color';

/** Надписи выбора цвета (по умолчанию английские). */
export interface ColorPickerLabels {
  readonly picker: string;
  /** Квадрат насыщенности и яркости. */
  readonly area: string;
  readonly hue: string;
  readonly alpha: string;
  readonly format: string;
  readonly hex: string;
  readonly red: string;
  readonly green: string;
  readonly blue: string;
  readonly saturation: string;
  readonly brightness: string;
  readonly cancel: string;
  readonly apply: string;
}

export const DEFAULT_COLOR_PICKER_LABELS: ColorPickerLabels = {
  picker: 'Color picker',
  area: 'Saturation and brightness',
  hue: 'Hue',
  alpha: 'Opacity',
  format: 'Color format',
  hex: 'HEX',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  saturation: 'Saturation',
  brightness: 'Brightness',
  cancel: 'Cancel',
  apply: 'Apply',
};

export type ColorFormat = 'hex' | 'rgb' | 'hsb';

export interface ColorPickerOptions {
  /** Начальный цвет: `#rgb`, `#rrggbb`, `#rrggbbaa` или `rgb[a]()`. Непонятный — чёрный. */
  readonly value?: string;
  /** Показывать ползунок и поле прозрачности (по умолчанию да). Без него цвет всегда непрозрачный. */
  readonly alpha?: boolean;
  /** Сколько цифр в результате: `'auto'` — восемь только при прозрачности меньше 100 %, `'always'` — всегда восемь. */
  readonly alphaHex?: 'auto' | 'always';
  readonly format?: ColorFormat;
  readonly labels?: Partial<ColorPickerLabels>;
  readonly theme?: 'light' | 'dark';
  /** Кнопки «Отмена» и «Применить» внизу (по умолчанию нет: цвет забирают из `onChange`). */
  readonly actions?: boolean;
  /** Цвет меняется (каждое движение ползунка, каждое подтверждённое поле). */
  onChange?(hex: string): void;
  /** «Применить» или Enter в поле. */
  onApply?(hex: string): void;
  /** «Отмена» или Escape. */
  onCancel?(): void;
}

export interface ColorPickerHandle {
  /** Корневой элемент: вставьте его куда нужно. */
  readonly element: HTMLElement;
  getValue(): string;
  /** Ставит цвет снаружи (без `onChange`). */
  setValue(value: string): void;
  /** Снимает обработчики и убирает элемент. */
  destroy(): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const STEP_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * Выбор цвета с прозрачностью, как в привычных дизайн-системах: квадрат насыщенности и яркости, ползунки оттенка и
 * прозрачности, образец и поля HEX / RGB / HSB с процентом прозрачности. Всё управляется мышью, пальцем и клавиатурой
 * (стрелки, с Shift — шаг крупнее). Без фреймворка: подходит для React, Vue и любого другого кода.
 */
export function createColorPicker(options: ColorPickerOptions = {}): ColorPickerHandle {
  const labels = { ...DEFAULT_COLOR_PICKER_LABELS, ...options.labels };
  const withAlpha = options.alpha !== false;
  let format: ColorFormat = options.format ?? 'hex';
  let color: Hsva = { h: 0, s: 0, v: 0, a: 1 };
  const cleanups: Array<() => void> = [];

  const thumb = () => el('span', { 'data-inkbrick-part': 'color-thumb', 'aria-hidden': 'true' });
  const areaThumb = thumb();
  const hueThumb = thumb();
  const alphaThumb = thumb();
  const area = el(
    'div',
    { 'data-inkbrick-part': 'color-area', role: 'slider', tabindex: 0, 'aria-label': labels.area },
    [areaThumb],
  );
  const hue = el(
    'div',
    {
      'data-inkbrick-part': 'color-hue',
      role: 'slider',
      tabindex: 0,
      'aria-label': labels.hue,
      'aria-valuemin': 0,
      'aria-valuemax': 360,
    },
    [hueThumb],
  );
  const alphaTrack = el('span', {
    'data-inkbrick-part': 'color-alpha-fill',
    'aria-hidden': 'true',
  });
  const alpha = el(
    'div',
    {
      'data-inkbrick-part': 'color-alpha',
      role: 'slider',
      tabindex: 0,
      'aria-label': labels.alpha,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
    },
    [alphaTrack, alphaThumb],
  );
  const previewFill = el('span', { 'data-inkbrick-part': 'color-preview-fill' });
  const preview = el('span', { 'data-inkbrick-part': 'color-preview', 'aria-hidden': 'true' }, [
    previewFill,
  ]);
  const select = el(
    'select',
    { 'data-inkbrick-part': 'color-format', 'aria-label': labels.format },
    [
      el('option', { value: 'hex' }, ['HEX']),
      el('option', { value: 'rgb' }, ['RGB']),
      el('option', { value: 'hsb' }, ['HSB']),
    ],
  );
  const fields = el('div', { 'data-inkbrick-part': 'color-fields' });
  const opacity = el('input', {
    type: 'text',
    inputmode: 'numeric',
    'data-inkbrick-part': 'color-opacity',
    'aria-label': `${labels.alpha}, %`,
  });
  const cancel = el('button', { type: 'button', 'data-inkbrick-part': 'color-cancel' }, [
    labels.cancel,
  ]);
  const apply = el(
    'button',
    { type: 'button', 'data-inkbrick-part': 'color-apply', 'data-primary': true },
    [labels.apply],
  );

  const element = el(
    'div',
    {
      'data-inkbrick-ui': 'color-picker',
      'data-inkbrick-theme': options.theme,
      role: 'group',
      'aria-label': labels.picker,
    },
    [
      area,
      el('div', { 'data-inkbrick-part': 'color-row' }, [
        el('div', { 'data-inkbrick-part': 'color-sliders' }, withAlpha ? [hue, alpha] : [hue]),
        preview,
      ]),
      el(
        'div',
        { 'data-inkbrick-part': 'color-inputs' },
        withAlpha ? [select, fields, opacity] : [select, fields],
      ),
      ...(options.actions
        ? [el('div', { 'data-inkbrick-part': 'color-actions' }, [cancel, apply])]
        : []),
    ],
  );

  const hex = () =>
    formatHex(hsvToRgb(withAlpha ? color : { ...color, a: 1 }), options.alphaHex ?? 'auto');

  // Поля текущего формата: перестраиваются при смене формата, значения обновляет `render`.
  let inputs: HTMLInputElement[] = [];

  const buildFields = () => {
    const names =
      format === 'hex'
        ? [labels.hex]
        : format === 'rgb'
          ? [labels.red, labels.green, labels.blue]
          : [labels.hue, labels.saturation, labels.brightness];

    inputs = names.map((label) =>
      el('input', {
        type: 'text',
        inputmode: format === 'hex' ? 'text' : 'numeric',
        spellcheck: 'false',
        'data-inkbrick-part': 'color-field',
        'aria-label': label,
      }),
    );
    fields.replaceChildren(...inputs);
    fields.setAttribute('data-format', format);
    select.value = format;
  };

  const render = () => {
    const rgb = hsvToRgb({ ...color, a: 1 });
    const solid = formatHex(rgb, 'never');
    const percent = Math.round(color.a * 100);
    const values =
      format === 'hex'
        ? [solid.slice(1).toUpperCase()]
        : format === 'rgb'
          ? [rgb.r, rgb.g, rgb.b].map(String)
          : [Math.round(color.h), Math.round(color.s * 100), Math.round(color.v * 100)].map(String);

    element.style.setProperty('--inkbrick-picker-hue', `hsl(${color.h} 100% 50%)`);
    element.style.setProperty('--inkbrick-picker-solid', solid);
    previewFill.style.background = hex();
    areaThumb.style.left = `${color.s * 100}%`;
    areaThumb.style.top = `${(1 - color.v) * 100}%`;
    hueThumb.style.left = `${(color.h / 360) * 100}%`;
    alphaThumb.style.left = `${percent}%`;
    area.setAttribute(
      'aria-valuetext',
      `${labels.saturation} ${Math.round(color.s * 100)}%, ${labels.brightness} ${Math.round(color.v * 100)}%`,
    );
    hue.setAttribute('aria-valuenow', String(Math.round(color.h)));
    alpha.setAttribute('aria-valuenow', String(percent));
    alpha.setAttribute('aria-valuetext', `${percent}%`);

    // Поле, в котором сейчас печатают, не трогаем: иначе каретка прыгала бы на каждом символе.
    inputs.forEach((input, index) => {
      if (input !== document.activeElement) input.value = values[index];
    });
    if (opacity !== document.activeElement) opacity.value = `${percent}%`;
  };

  const set = (next: Hsva, notify = true) => {
    color = {
      h: clamp(next.h, 0, 360),
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1),
      a: clamp(next.a, 0, 1),
    };
    render();
    if (notify) options.onChange?.(hex());
  };

  const setValue = (value: string) => {
    const parsed = parseColor(value);

    if (!parsed) return;

    // Серый (насыщенность 0) не знает своего оттенка: оставляем текущий, чтобы ползунок оттенка не прыгал на красный.
    const next = rgbToHsv(parsed);

    color = { ...next, h: next.s === 0 ? color.h : next.h };
    render();
  };

  /** Перетаскивание по полосе или квадрату: позиция указателя в долях от 0 до 1. */
  const drag = (target: HTMLElement, move: (x: number, y: number) => void) => {
    const at = (event: PointerEvent) => {
      const box = target.getBoundingClientRect();

      move(
        box.width > 0 ? clamp((event.clientX - box.left) / box.width, 0, 1) : 0,
        box.height > 0 ? clamp((event.clientY - box.top) / box.height, 0, 1) : 0,
      );
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;

      event.preventDefault();
      target.focus({ preventScroll: true });
      target.setPointerCapture?.(event.pointerId);
      at(event);
    };
    const moveWhilePressed = (event: PointerEvent) => {
      if (target.hasPointerCapture?.(event.pointerId) ?? event.buttons === 1) at(event);
    };

    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', moveWhilePressed);
    cleanups.push(() => {
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', moveWhilePressed);
    });
  };

  drag(area, (x, y) => set({ ...color, s: x, v: 1 - y }));
  drag(hue, (x) => set({ ...color, h: x * 360 }));
  drag(alpha, (x) => set({ ...color, a: x }));

  /** Клавиши ползунка: стрелки на шаг, с Shift — на десять, Home и End — к краям. */
  const keys = (
    target: HTMLElement,
    step: (dx: number, dy: number) => void,
    edge?: (end: boolean) => void,
  ) => {
    const listener = (event: KeyboardEvent) => {
      const arrow = STEP_KEYS[event.key];

      if (arrow) {
        const size = event.shiftKey ? 10 : 1;

        step(arrow[0] * size, arrow[1] * size);
      } else if (edge && (event.key === 'Home' || event.key === 'End')) {
        edge(event.key === 'End');
      } else {
        return;
      }

      // Стрелки принадлежат ползунку, а не меню вокруг.
      event.preventDefault();
      event.stopPropagation();
    };

    target.addEventListener('keydown', listener);
    cleanups.push(() => target.removeEventListener('keydown', listener));
  };

  keys(area, (dx, dy) => set({ ...color, s: color.s + dx / 100, v: color.v + dy / 100 }));
  keys(
    hue,
    (dx, dy) => set({ ...color, h: color.h + dx + dy }),
    (end) => set({ ...color, h: end ? 360 : 0 }),
  );
  keys(
    alpha,
    (dx, dy) => set({ ...color, a: color.a + (dx + dy) / 100 }),
    (end) => set({ ...color, a: end ? 1 : 0 }),
  );

  /** Подтверждает поля текущего формата; неверное значение возвращается к прежнему. */
  const commitFields = () => {
    const numbers = inputs.map((input) => Number(input.value.trim().replace('%', '')));
    let next: Hsva | null = null;

    if (format === 'hex') {
      const text = inputs[0].value.trim();
      const parsed = parseColor(text);
      // Прозрачность берётся из поля, только если она в нём записана (#rgba, #rrggbbaa); иначе остаётся прежней.
      const ownAlpha = /^#?(?:[\da-f]{4}|[\da-f]{8})$/i.test(text);

      if (parsed) next = rgbToHsv(ownAlpha ? parsed : { ...parsed, a: color.a });
    } else if (numbers.every(Number.isFinite)) {
      next =
        format === 'rgb'
          ? rgbToHsv({
              r: clamp(numbers[0], 0, 255),
              g: clamp(numbers[1], 0, 255),
              b: clamp(numbers[2], 0, 255),
              a: color.a,
            })
          : { h: numbers[0], s: numbers[1] / 100, v: numbers[2] / 100, a: color.a };
    }

    if (next) {
      // Серый из полей тоже не сбрасывает оттенок ползунка.
      set({ ...next, h: next.s === 0 && format !== 'hsb' ? color.h : next.h });
    } else {
      render();
    }
  };

  const commitOpacity = () => {
    const value = Number(opacity.value.trim().replace('%', ''));

    if (Number.isFinite(value)) set({ ...color, a: value / 100 });
    else render();
  };

  const fieldKeys = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();
    if (event.target === opacity) commitOpacity();
    else commitFields();
    options.onApply?.(hex());
  };

  const fieldChange = (event: Event) => {
    if (event.target === opacity) commitOpacity();
    else if ((event.target as HTMLElement).getAttribute('data-inkbrick-part') === 'color-field')
      commitFields();
  };

  const formatChange = () => {
    format = select.value as ColorFormat;
    buildFields();
    render();
  };

  const rootKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && options.onCancel) {
      event.preventDefault();
      event.stopPropagation();
      options.onCancel();
    }
  };

  const onCancel = () => options.onCancel?.();
  const onApply = () => options.onApply?.(hex());

  element.addEventListener('keydown', fieldKeys);
  element.addEventListener('keydown', rootKeys);
  element.addEventListener('change', fieldChange);
  select.addEventListener('change', formatChange);
  cancel.addEventListener('click', onCancel);
  apply.addEventListener('click', onApply);
  cleanups.push(() => {
    element.removeEventListener('keydown', fieldKeys);
    element.removeEventListener('keydown', rootKeys);
    element.removeEventListener('change', fieldChange);
    select.removeEventListener('change', formatChange);
    cancel.removeEventListener('click', onCancel);
    apply.removeEventListener('click', onApply);
  });

  buildFields();
  setValue(options.value ?? '#000000');
  if (!parseColor(options.value ?? '')) render();

  return {
    element,
    getValue: hex,
    setValue,
    destroy() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      element.remove();
    },
  };
}
