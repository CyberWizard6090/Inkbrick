export interface FormulaRenderOptions {
  readonly display: boolean;
}

/**
 * Рисует формулу в `target`: по коду LaTeX строит DOM (MathML, HTML, SVG…). Может быть асинхронной — например, для
 * подгрузки библиотеки. Если код ошибочен, функция должна бросить исключение: редактор покажет исходный текст и
 * сообщение об ошибке. Встроенный `temmlRenderer` строит MathML; KaTeX подключается так:
 * `(latex, target, { display }) => katex.render(latex, target, { displayMode: display, throwOnError: true })`.
 *
 * Результат вставляется в страницу как есть, поэтому используйте только безопасные режимы библиотек
 * (например, `trust: false`): LaTeX приходит из документа и может быть недоверенным.
 */
export type FormulaRenderer = (
  latex: string,
  target: HTMLElement,
  options: FormulaRenderOptions,
) => void | Promise<void>;

type TemmlApi = typeof import('temml').default;

let temml: Promise<TemmlApi> | undefined;

/** Temml (≈ 480 КБ) подгружается при первой формуле: документы без формул её не платят. */
const loadTemml = () => (temml ??= import('temml').then((module) => module.default));

export const temmlRenderer: FormulaRenderer = async (latex, target, { display }) => {
  const api = await loadTemml();

  api.render(latex, target, {
    displayMode: display,
    throwOnError: true,
    trust: false,
    strict: false,
    maxExpand: 1000,
  });
};

let mathCss: Promise<string> | undefined;

const loadMathCss = () => (mathCss ??= import('./mathCss').then((module) => module.MATH_CSS));

let shadowSheet: CSSStyleSheet | null | undefined;

function constructableSheet(css: string): CSSStyleSheet | null {
  if (shadowSheet !== undefined) return shadowSheet;

  try {
    if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
      shadowSheet = new CSSStyleSheet();
      shadowSheet.replaceSync(css);

      return shadowSheet;
    }
  } catch {
    // нет поддержки конструируемых таблиц стилей — ниже используется <style>
  }

  return (shadowSheet = null);
}

const styled = new WeakSet<Document | ShadowRoot>();

function applyMathStyles(scope: Document | ShadowRoot, css: string): void {
  if (typeof ShadowRoot !== 'undefined' && scope instanceof ShadowRoot) {
    const sheet = constructableSheet(css);

    if (sheet && Array.isArray(scope.adoptedStyleSheets)) {
      scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sheet];
    } else {
      const style = globalThis.document.createElement('style');

      style.textContent = css;
      scope.appendChild(style);
    }

    return;
  }

  const doc = scope as Document;

  if (doc.head.querySelector('style[data-inkbrick-math]')) return;

  const style = doc.createElement('style');

  style.setAttribute('data-inkbrick-math', '');
  style.textContent = `@layer inkbrick.math {\n${css}\n}`;
  doc.head.appendChild(style);
}

/**
 * Подключает стили MathML (Temml) к документу или теневому корню встроенной формулы. В документе стили кладутся
 * в слой `inkbrick.math`, поэтому любое ваше правило без слоя сильнее. Стили подгружаются при первом вызове
 * и применяются, как только загрузятся (одновременно с самой формулой).
 */
export function ensureMathStyles(scope: Document | ShadowRoot): void {
  if (styled.has(scope)) return;

  styled.add(scope);
  void loadMathCss().then((css) => applyMathStyles(scope, css));
}

type Rendered = readonly Node[];

const MAX_CACHE = 500;
const caches = new WeakMap<FormulaRenderer, Map<string, Rendered>>();

function cacheOf(renderer: FormulaRenderer): Map<string, Rendered> {
  let cache = caches.get(renderer);

  if (!cache) caches.set(renderer, (cache = new Map()));

  return cache;
}

export type FormulaState = 'empty' | 'source' | 'loading' | 'ready' | 'error';

export interface MountFormulaOptions {
  readonly display: boolean;
  readonly renderer: FormulaRenderer | null;
  readonly onSettled?: (state: 'ready' | 'error', message?: string) => void;
}

/**
 * Рисует формулу в `target`. Пока идёт расчёт, виден исходный код (`data-state="loading"`); готовый результат кладётся
 * в кэш, поэтому одинаковые формулы (и перерисовка блока на каждое нажатие клавиши) появляются сразу, без мигания.
 * Возвращает функцию отмены: после неё устаревший результат в `target` не попадёт.
 */
export function mountFormula(
  target: HTMLElement,
  latex: string,
  { display, renderer, onSettled }: MountFormulaOptions,
): () => void {
  const source = latex.trim();

  if (source === '') {
    target.replaceChildren();
    target.setAttribute('data-state', 'empty');

    return () => undefined;
  }

  if (!renderer) {
    target.textContent = latex;
    target.setAttribute('data-state', 'source');

    return () => undefined;
  }

  const key = `${display ? 'd' : 'i'}:${latex}`;
  const cache = cacheOf(renderer);
  const cached = cache.get(key);

  if (cached) {
    target.replaceChildren(...cached.map((node) => node.cloneNode(true)));
    target.setAttribute('data-state', 'ready');
    onSettled?.('ready');

    return () => undefined;
  }

  let cancelled = false;

  target.textContent = latex;
  target.setAttribute('data-state', 'loading');

  const scratch = globalThis.document.createElement('span');

  void (async () => {
    try {
      await renderer(latex, scratch, { display });

      if (cancelled) return;

      const nodes = [...scratch.childNodes];

      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);

      cache.set(
        key,
        nodes.map((node) => node.cloneNode(true)),
      );
      target.replaceChildren(...nodes);
      target.setAttribute('data-state', 'ready');
      onSettled?.('ready');
    } catch (error) {
      if (cancelled) return;

      target.textContent = latex;
      target.setAttribute('data-state', 'error');
      onSettled?.('error', error instanceof Error ? error.message : String(error));
    }
  })();

  return () => {
    cancelled = true;
  };
}
