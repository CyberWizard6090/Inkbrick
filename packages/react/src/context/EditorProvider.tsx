import { useLayoutEffect, useMemo, type ReactNode } from 'react';

import type { Editor } from '@inkbrick/engine';

import { EditorView } from '../editing/EditorView';
import { highlightCode } from '../code/highlight';
import type { CodeHighlighter } from '../code/types';
import { createTranslator, resolveMessages } from '../i18n/translate';
import { temmlRenderer, type FormulaRenderer } from '../math/renderer';
import type { PartialMessages } from '../i18n/en';
import { resolveKeymap } from '../keymap/keymap';
import type { KeyBinding } from '../keymap/types';
import { resolveSlashItems } from '../slash/defaultSlashItems';
import type { ImageOptions } from '../images/types';
import type { SlashMenuItem } from '../slash/types';
import { EditorUIContext } from '../ui/EditorUIContext';
import type { EditorPresentation } from '../ui/presentation';
import type { BlockComponentRegistry, EditorSlots } from '../ui/types';
import { EditorContext, EditorViewContext } from './EditorContext';
import { blockComponentsOf, type ReactBlockDefinition } from '../blocks/defineBlock';
import { controllerKeymap, controllerSlashItems, mergeById } from '../controllers/adapters';

export interface EditorProviderProps {
  readonly editor: Editor;
  readonly children: ReactNode;
  /**
   * Визуальный слой одним объектом (дизайн-система): представления блоков, оболочка, slash-меню, подсветка кода
   * и формулы — см. `definePresentation`. Отдельные props ниже уточняют его. Держите объект стабильным.
   */
  readonly presentation?: EditorPresentation;
  /**
   * Пользовательские блоки из `defineBlock`: их компоненты добавляются к `components` (prop `components`
   * с тем же flavour важнее). Схемы и контроллеры этих блоков передайте и в `new Editor({ blocks })`:
   * пункты slash-меню, меню блока и клавиши берутся из контроллеров редактора. Держите массив стабильным.
   */
  readonly blocks?: readonly ReactBlockDefinition<any>[];
  /**
   * Свои React-представления блоков: `{ 'block:paragraph': MyParagraph }`.
   * Не указанные flavour используют стандартные компоненты Inkbrick.
   * Чтобы не перерисовывать документ без необходимости, держите объект стабильным
   * (вынесите из компонента или оберните в useMemo).
   */
  readonly components?: BlockComponentRegistry;
  readonly slots?: EditorSlots;
  /**
   * Пункты slash-меню. Дополняют стандартные (одинаковый `id` заменяет стандартный пункт);
   * `false` выключает меню. Держите массив стабильным (вынесите из компонента или useMemo).
   */
  readonly slashItems?: readonly SlashMenuItem[] | false;
  /**
   * Подсветка синтаксиса в блоках кода. По умолчанию — встроенный `highlightCode` (без зависимостей);
   * свой подсветчик (Shiki, Prism, highlight.js) — функция `(code, language) => токены`; `false` выключает подсветку.
   * Держите функцию стабильной: смена функции перерисовывает все блоки кода.
   */
  readonly highlighter?: CodeHighlighter | false;
  /**
   * Отрисовка формул (блоки и встроенные): по умолчанию Temml → MathML, подгружается при первой формуле.
   * Свой подсчётчик (KaTeX, MathJax) — функция `(latex, target, { display }) => void | Promise<void>`;
   * `false` — показывать только исходный код. Держите функцию стабильной: её смена перерисовывает все формулы.
   */
  readonly formulaRenderer?: FormulaRenderer | false;
  /**
   * Язык интерфейса: код подключённого словаря (`'en'`, `'ru'` или свой, см. `registerLocale` и `locales`).
   * `'pt-BR'` без своего словаря возьмёт `'pt'`; неизвестный код — английский. По умолчанию `'en'`.
   */
  readonly locale?: string;
  /**
   * Словари, подключаемые только к этому редактору: `{ de: { 'menu.delete': 'Löschen', … } }`.
   * Словарь может быть неполным — недостающее берётся из английского. Держите объект стабильным.
   */
  readonly locales?: Readonly<Record<string, PartialMessages>>;
  /** Точечные замены строк поверх выбранного языка: `{ 'menu.delete': 'Убрать' }`. Держите объект стабильным. */
  readonly messages?: PartialMessages;
  /**
   * Свои привязки клавиш. Привязка с `id` стандартной (`'undo'`, `'format.bold'`, `'indent'`, …) заменяет её,
   * новая проверяется раньше стандартных; `unbind('id')` отключает стандартную. Держите массив стабильным.
   */
  readonly keymap?: readonly KeyBinding[];
  /**
   * Режим только чтения: ввод, команды, undo, toolbar, ручки блоков и slash-меню отключены,
   * выделение и копирование работают. Применяется к редактору (`editor.setReadOnly`), поэтому
   * защищает документ и от вызовов из кода.
   */
  readonly readOnly?: boolean;
  /**
   * Изображения: `upload` — куда сохранять файлы (иначе картинки встраиваются в документ как data:-адреса
   * до `maxInlineBytes`), `acceptedTypes`, `onError`. Держите объект стабильным.
   */
  readonly images?: ImageOptions;
}

export function EditorProvider({
  editor,
  children,
  presentation,
  blocks,
  components,
  slots,
  slashItems,
  keymap,
  highlighter,
  formulaRenderer,
  locale,
  locales,
  messages,
  readOnly,
  images,
}: EditorProviderProps) {
  const view = useMemo(() => new EditorView(), [editor]);

  useLayoutEffect(() => {
    if (readOnly === undefined) return;

    const previous = editor.readOnly;

    editor.setReadOnly(readOnly);

    return () => editor.setReadOnly(previous);
  }, [editor, readOnly]);

  const t = useMemo(
    () => createTranslator(resolveMessages({ locale, locales, messages })),
    [locale, locales, messages],
  );

  const ui = useMemo(() => {
    const visual = presentation ?? {};
    const code = highlighter ?? visual.highlighter;
    const math = formulaRenderer ?? visual.formulaRenderer;
    const customSlash = slashItems ?? visual.slashItems;
    const customKeys = keymap ?? [];

    return {
      components: { ...blockComponentsOf(blocks), ...visual.components, ...components },
      slots: { ...visual.slots, ...slots },
      // Пункты контроллеров идут после стандартных; пункт приложения с тем же id важнее.
      slashItems:
        customSlash === false
          ? []
          : resolveSlashItems(mergeById(controllerSlashItems(editor), customSlash ?? []), t),
      highlighter: code === false ? null : (code ?? highlightCode),
      formulaRenderer: math === false ? null : (math ?? temmlRenderer),
      locale: locale ?? 'en',
      t,
      keymap: resolveKeymap(mergeById(controllerKeymap(editor), customKeys, 'preferred-first')),
      images: images ?? {},
      readOnly,
    };
  }, [
    editor,
    presentation,
    blocks,
    components,
    slots,
    slashItems,
    keymap,
    highlighter,
    formulaRenderer,
    locale,
    t,
    readOnly,
    images,
  ]);

  return (
    <EditorContext.Provider value={editor}>
      <EditorViewContext.Provider value={view}>
        <EditorUIContext.Provider value={ui}>{children}</EditorUIContext.Provider>
      </EditorViewContext.Provider>
    </EditorContext.Provider>
  );
}
