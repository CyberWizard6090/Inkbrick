/**
 * Маленькие помощники DOM для всех частей пакета: окна и выбор цвета строятся без фреймворка и работают в React, Vue,
 * Svelte и без них.
 */
type Attributes = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** Элемент с атрибутами (`false`, `null` и `undefined` — атрибута нет, `true` — пустой атрибут) и детьми. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: ReadonlyArray<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  setAttributes(element, attributes);
  element.append(...children);

  return element;
}

export function setAttributes(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
}

let counter = 0;

/** Уникальный id для связей `aria-*` внутри окна. */
export const uniqueId = (prefix: string): string => `${prefix}-${(counter += 1)}`;

/**
 * Включает или выключает кнопку. Выключаемая кнопка с фокусом отдаёт его `fallback` (обычно самому окну): иначе фокус
 * уходит на `body`, и окно перестаёт слышать клавиши — Escape, стрелки, Tab по кругу.
 */
export function setDisabled(
  button: HTMLButtonElement,
  disabled: boolean,
  fallback: HTMLElement,
): void {
  if (disabled && button.ownerDocument.activeElement === button)
    fallback.focus({ preventScroll: true });

  button.disabled = disabled;
}
