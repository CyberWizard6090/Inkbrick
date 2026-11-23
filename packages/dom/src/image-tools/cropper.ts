import { el, setAttributes, setDisabled, uniqueId } from '../shared/dom';
import { icon, type IconName } from './icons';
import {
  CROP_HANDLES,
  CROP_RATIOS,
  FULL_RECT,
  clampRect,
  fitRatio,
  isFullRect,
  isPortrait,
  landscapeOf,
  moveRect,
  oriented,
  relativeRatio,
  resizeRect,
  roundRect,
  type CropAspect,
  type CropHandle,
  type CropRect,
} from './geometry';
import { modal, overlayHost, watchSize } from './modal';

/** Надписи окна обрезки (по умолчанию английские). */
export interface CropperLabels {
  readonly title: string;
  readonly cancel: string;
  readonly save: string;
  /** Кнопка меню форм. */
  readonly shape: string;
  readonly free: string;
  readonly circle: string;
  readonly square: string;
  readonly portrait: string;
  readonly landscape: string;
  /** Подпись рамки для программ чтения с экрана: как ею управлять. */
  readonly frame: string;
}

export const DEFAULT_CROPPER_LABELS: CropperLabels = {
  title: 'Crop image',
  cancel: 'Cancel',
  save: 'Save',
  shape: 'Shape',
  free: 'Freeform',
  circle: 'Circle',
  square: 'Square',
  portrait: 'Portrait',
  landscape: 'Landscape',
  frame:
    'Crop area: drag to move, drag the edges to resize; arrow keys move it, Shift with arrows resizes',
};

/** Что выбрал пользователь: рамка в долях картинки, форма и размер самой картинки в пикселях. */
export interface CropResult {
  readonly rect: CropRect;
  readonly aspect: CropAspect;
  readonly natural: { readonly width: number; readonly height: number };
}

export interface CropperOptions {
  readonly src: string;
  readonly alt?: string;
  /** Рамка, с которой окно открывается (по умолчанию — вся картинка). */
  readonly initialRect?: CropRect;
  readonly initialAspect?: CropAspect;
  readonly labels?: Partial<CropperLabels>;
  /** Куда вставить окно (по умолчанию `document.body`). */
  readonly container?: Element | null;
  /** Тема окна (`data-inkbrick-theme`), если она задана не на странице целиком. */
  readonly theme?: 'light' | 'dark';
  /** «Сохранить» (или Enter). Окно не закрывается само: закройте его (`close`), когда результат принят. */
  onSave(result: CropResult): void;
  /** «Отмена» или Escape. Окно не закрывается само. */
  onCancel(): void;
  /** Картинка не загрузилась (по умолчанию — как «Отмена»). */
  onError?(): void;
}

/** Открытое окно обрезки. */
export interface CropperHandle {
  /** Убирает окно (фокус возвращается туда, где был). Повторный вызов ничего не делает. */
  close(): void;
  /** Сохранение идёт: кнопки заблокированы, Enter не срабатывает. */
  setBusy(busy: boolean): void;
}

const STEP = 0.01;
const BIG_STEP = 0.1;
/** Наименьшая сторона рамки на экране, px. */
const MIN_PX = 24;

const shapeIcon = (aspect: CropAspect): IconName =>
  aspect === 'free'
    ? 'frame'
    : aspect === 'circle'
      ? 'circle'
      : aspect === '1:1'
        ? 'square'
        : isPortrait(aspect)
          ? 'portrait'
          : 'landscape';

/**
 * Открывает окно обрезки во весь экран: картинка с рамкой, которую двигают и тянут за стороны и углы; сверху — меню форм
 * (свободная, круг, квадрат, пропорции в книжной и альбомной ориентации), «Отмена» и «Сохранить». Окно ничего не меняет
 * само: результат приходит в `onSave`, файл из него делает `cropImage`. Без фреймворка: подходит для React, Vue и любого
 * другого кода.
 */
export function openCropper(options: CropperOptions): CropperHandle {
  const labels = { ...DEFAULT_CROPPER_LABELS, ...options.labels };
  const initialAspect = options.initialAspect ?? 'free';
  const onError = options.onError ?? options.onCancel;

  let rect = clampRect(options.initialRect ?? FULL_RECT);
  let aspect: CropAspect = initialAspect;
  let portrait = isPortrait(initialAspect);
  let natural: { width: number; height: number } | null = null;
  let area: { width: number; height: number } | null = null;
  let shown = { width: 0, height: 0 };
  let busy = false;
  let closed = false;
  let drag: {
    pointer: number;
    handle: CropHandle | null;
    x: number;
    y: number;
    start: CropRect;
  } | null = null;

  const titleId = uniqueId('inkbrick-crop-title');
  const image = el('img', {
    src: options.src,
    alt: options.alt ?? '',
    draggable: 'false',
    referrerpolicy: 'no-referrer',
    'data-inkbrick-part': 'cropper-image',
  });
  const shade = el('div', { 'data-inkbrick-part': 'cropper-shade' });
  const handles = CROP_HANDLES.map((handle) =>
    el('span', {
      'data-inkbrick-part': 'cropper-handle',
      'data-handle': handle,
      'aria-hidden': 'true',
    }),
  );
  const box = el(
    'div',
    { 'data-inkbrick-part': 'cropper-box', role: 'group', tabindex: 0, 'aria-label': labels.frame },
    handles,
  );
  const canvas = el('div', { 'data-inkbrick-part': 'cropper-canvas' }, [
    image,
    // Затемнение вокруг рамки обрезано краями картинки; сама рамка с ручками — поверх и может выходить за край.
    el('div', { 'data-inkbrick-part': 'cropper-shade-clip', 'aria-hidden': 'true' }, [shade]),
    box,
  ]);
  const stage = el('div', { 'data-inkbrick-part': 'cropper-stage' }, [canvas]);
  const trigger = el('button', {
    type: 'button',
    'data-inkbrick-part': 'cropper-shape-button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': labels.shape,
    title: labels.shape,
  });
  const shapes = el('div', { 'data-inkbrick-part': 'cropper-shapes' }, [trigger]);
  const cancel = el('button', { type: 'button', 'data-inkbrick-part': 'cropper-cancel' }, [
    labels.cancel,
  ]);
  const save = el(
    'button',
    { type: 'button', 'data-inkbrick-part': 'cropper-save', 'data-primary': true },
    [labels.save],
  );
  const dialog = el(
    'div',
    {
      'data-inkbrick-ui': 'image-cropper',
      'data-inkbrick-theme': options.theme,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: -1,
      'data-testid': 'image-cropper',
    },
    [
      el('div', { 'data-inkbrick-part': 'cropper-panel' }, [
        el('div', { 'data-inkbrick-part': 'cropper-bar' }, [
          shapes,
          el('h2', { id: titleId, 'data-inkbrick-part': 'cropper-title' }, [labels.title]),
          el('div', { 'data-inkbrick-part': 'cropper-actions' }, [cancel, save]),
        ]),
        stage,
      ]),
    ],
  );

  const ratio = () => relativeRatio(aspect, natural ? natural.width / natural.height : 1);
  const min = () => ({
    width: shown.width > 0 ? Math.min(1, MIN_PX / shown.width) : 0.05,
    height: shown.height > 0 ? Math.min(1, MIN_PX / shown.height) : 0.05,
  });

  const render = () => {
    const ready = !!natural && !!area;

    shown = { width: 0, height: 0 };

    if (natural && area) {
      const scale = Math.min(area.width / natural.width, area.height / natural.height);

      shown = { width: natural.width * scale, height: natural.height * scale };
    }

    canvas.style.width = shown.width ? `${shown.width}px` : '';
    canvas.style.height = shown.height ? `${shown.height}px` : '';
    setAttributes(canvas, { 'data-ready': ready });

    for (const part of [box, shade]) {
      part.style.left = `${rect.x * 100}%`;
      part.style.top = `${rect.y * 100}%`;
      part.style.width = `${rect.width * 100}%`;
      part.style.height = `${rect.height * 100}%`;
      part.setAttribute('data-shape', aspect === 'circle' ? 'circle' : 'rect');
    }

    trigger.replaceChildren(icon(shapeIcon(aspect)), icon('chevron-down'));
    setDisabled(cancel, busy, dialog);
    setDisabled(save, busy || !natural, dialog);
    setAttributes(save, { 'data-busy': busy });
  };

  const setRect = (next: CropRect) => {
    rect = next;
    render();
  };

  const doSave = () => {
    if (!natural || busy) return;

    options.onSave({ rect: roundRect(rect), aspect, natural });
  };

  // --- Меню форм ---

  let menu: HTMLDivElement | null = null;

  const menuItems = () => [
    ...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []),
  ];

  const closeMenu = (refocus: boolean) => {
    if (!menu) return;

    menu.remove();
    menu = null;
    setAttributes(trigger, { 'aria-expanded': 'false', 'aria-controls': null });
    document.removeEventListener('pointerdown', outside, true);
    if (refocus) trigger.focus({ preventScroll: true });
  };

  function outside(event: PointerEvent) {
    const target = event.target as Node | null;

    if (target && !menu?.contains(target) && !trigger.contains(target)) closeMenu(false);
  }

  const choose = (next: CropAspect) => {
    aspect = next;
    closeMenu(false);

    if (next !== 'free' && next !== 'circle' && next !== '1:1') portrait = isPortrait(next);
    if (natural) rect = fitRatio(rect, relativeRatio(next, natural.width / natural.height));

    render();
    box.focus({ preventScroll: true });
  };

  const item = (value: CropAspect, label: string, checked: boolean, attributes = {}) => {
    const button = el(
      'button',
      {
        type: 'button',
        role: 'menuitemradio',
        'aria-checked': String(checked),
        'data-inkbrick-part': 'cropper-shape',
        'data-aspect': value,
        tabindex: -1,
        ...attributes,
      },
      [el('span', {}, [label])],
    );

    if (aspect === value) button.append(icon('check'));
    button.addEventListener('click', () => choose(value));

    return button;
  };

  const openMenu = (focusFirst: boolean) => {
    const id = uniqueId('inkbrick-crop-shapes');
    const current = landscapeOf(aspect);
    const rows = CROP_RATIOS.map((ratioName) => {
      const value = oriented(ratioName, portrait);
      const chosen = current === ratioName;
      const main = item(chosen ? aspect : value, ratioName, chosen);
      const sides = (['portrait', 'landscape'] as const).map((side) => {
        const choice = oriented(ratioName, side === 'portrait');
        const on = chosen ? aspect === choice : portrait === (side === 'portrait');
        const button = el(
          'button',
          {
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': String(chosen && aspect === choice),
            'aria-label': `${ratioName} ${labels[side]}`,
            title: labels[side],
            'data-inkbrick-part': 'cropper-orientation',
            'data-aspect': choice,
            'data-pressed': on,
            tabindex: -1,
          },
          [icon(side)],
        );

        button.addEventListener('click', () => choose(choice));

        return button;
      });

      return el(
        'div',
        { role: 'none', 'data-inkbrick-part': 'cropper-ratio', 'data-checked': chosen },
        [main, ...sides],
      );
    });

    menu = el(
      'div',
      { id, role: 'menu', 'aria-label': labels.shape, 'data-inkbrick-part': 'cropper-menu' },
      [
        item('free', labels.free, aspect === 'free'),
        el('div', { role: 'separator', 'data-inkbrick-part': 'cropper-separator' }),
        item('circle', labels.circle, aspect === 'circle'),
        item('1:1', labels.square, aspect === '1:1'),
        ...rows,
      ],
    );

    menu.addEventListener('keydown', (event) => {
      const all = menuItems();
      const index = all.indexOf(document.activeElement as HTMLElement);

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        all[(index + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        (event.key === 'Home' ? all[0] : all[all.length - 1])?.focus();
      } else if (event.key === 'Escape') {
        // Escape закрывает меню, а не окно: окно смотрит на `defaultPrevented`.
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === 'Tab') {
        closeMenu(false);
      }
    });

    shapes.append(menu);
    setAttributes(trigger, { 'aria-expanded': 'true', 'aria-controls': id });
    document.addEventListener('pointerdown', outside, true);

    const all = menuItems();

    (focusFirst
      ? all[0]
      : (all.find((one) => one.getAttribute('aria-checked') === 'true') ?? all[0])
    )?.focus();
  };

  trigger.addEventListener('click', () => (menu ? closeMenu(false) : openMenu(false)));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !menu) {
      event.preventDefault();
      openMenu(true);
    }
  });

  // --- Рамка: перетаскивание и клавиши ---

  const startDrag = (event: PointerEvent, handle: CropHandle | null) => {
    if (event.button !== 0 || busy) return;

    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    box.focus({ preventScroll: true });
    drag = { pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, start: rect };
  };

  const moveDrag = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId || shown.width === 0) return;

    const dx = (event.clientX - drag.x) / shown.width;
    const dy = (event.clientY - drag.y) / shown.height;

    setRect(
      drag.handle
        ? resizeRect(drag.start, drag.handle, dx, dy, ratio(), min())
        : moveRect(drag.start, dx, dy),
    );
  };

  const endDrag = (event: PointerEvent) => {
    if (drag?.pointer === event.pointerId) drag = null;
  };

  const grips: Array<[HTMLElement, CropHandle | null]> = [
    [box, null],
    ...handles.map((node, index): [HTMLElement, CropHandle] => [node, CROP_HANDLES[index]]),
  ];

  for (const [element, handle] of grips) {
    element.addEventListener('pointerdown', (event) => startDrag(event, handle));
    element.addEventListener('pointermove', moveDrag);
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
  }

  box.addEventListener('keydown', (event) => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const arrow = arrows[event.key];

    if (arrow) {
      event.preventDefault();

      const step = event.ctrlKey || event.metaKey ? BIG_STEP : STEP;
      const [x, y] = arrow;

      setRect(
        event.shiftKey
          ? resizeRect(rect, 'se', x * step, y * step, ratio(), min())
          : moveRect(rect, x * step, y * step),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      doSave();
    }
  });

  // --- Картинка, кнопки, окно ---

  image.addEventListener('load', () => {
    const { naturalWidth, naturalHeight } = image;

    if (closed || naturalWidth <= 0 || naturalHeight <= 0) return;

    natural = { width: naturalWidth, height: naturalHeight };
    // Форма задана, а рамка — вся картинка: рамка сразу принимает её пропорции.
    if (isFullRect(rect))
      rect = fitRatio(rect, relativeRatio(aspect, naturalWidth / naturalHeight));
    if (initialAspect === 'free' && naturalHeight > naturalWidth) portrait = true;

    render();
    focusFrame();
  });
  // Окно уже закрыли, пока картинка грузилась: его владельцу ответ больше не нужен.
  image.addEventListener('error', () => {
    if (!closed) onError();
  });

  cancel.addEventListener('click', () => options.onCancel());
  save.addEventListener('click', doSave);

  // Рамка видна, только когда картинка загружена и окно измерено: тогда фокус и переходит на неё.
  const focusFrame = () => {
    if (
      natural &&
      area &&
      (document.activeElement === dialog || !dialog.contains(document.activeElement))
    ) {
      box.focus({ preventScroll: true });
    }
  };

  overlayHost(options.container).append(dialog);
  render();

  const releaseModal = modal(dialog, {
    // Пока картинка не загружена, рамка скрыта и фокус не примет: тогда его берёт само окно, а потом — рамка.
    initial: () => box,
    // Пока идёт сохранение, «Отмена» заблокирована — и Escape тоже не отменяет.
    onEscape: () => {
      if (menu) closeMenu(true);
      else if (!busy) options.onCancel();
    },
  });
  const stopWatching = watchSize(stage, (width, height) => {
    if (area?.width === width && area.height === height) return;

    area = { width, height };
    render();
    focusFrame();
  });

  return {
    close() {
      if (closed) return;

      closed = true;
      closeMenu(false);
      stopWatching();
      releaseModal();
      dialog.remove();
    },
    setBusy(next) {
      busy = next;
      render();
    },
  };
}

/**
 * То же окно как обещание: результат обрезки или `null`, если её отменили (или картинка не загрузилась). Окно закрывается
 * само сразу после выбора.
 */
export function cropDialog(
  options: Omit<CropperOptions, 'onSave' | 'onCancel' | 'onError'>,
): Promise<CropResult | null> {
  return new Promise((resolve) => {
    const finish = (result: CropResult | null) => {
      handle.close();
      resolve(result);
    };
    const handle = openCropper({
      ...options,
      onSave: (result) => finish(result),
      onCancel: () => finish(null),
    });
  });
}
