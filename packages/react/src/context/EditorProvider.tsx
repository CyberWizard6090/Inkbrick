import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import type { Editor } from '@inkbrick/engine';

import { EditorView } from '../editing/EditorView';
import { lazyHighlightCode } from '../code/lazyHighlight';
import type { CodeHighlighter } from '../code/types';
import {
  createTranslator,
  isLocaleLoaded,
  preloadLocale,
  resolveMessages,
} from '../i18n/translate';
import { temmlRenderer, type FormulaRenderer } from '../math/renderer';
import type { AppMessages } from '../i18n/translate';
import { resolveKeymap } from '../keymap/keymap';
import type { KeyBinding } from '../keymap/types';
import { resolveSlashItems } from '../slash/defaultSlashItems';
import type { ImageOptions } from '../images/types';
import type { SlashMenuItem } from '../slash/types';
import { EditorUIContext } from '../ui/EditorUIContext';
import type { EditorPresentation } from '../ui/presentation';
import type { BlockComponentRegistry, EditorSlots } from '../ui/types';
import type { FormattingMode } from '../context-menu/types';
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
   * Подсветка синтаксиса в блоках кода. По умолчанию — встроенный `highlightCode` (без зависимостей; грузится отдельным чанком при первом блоке кода);
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
  readonly locales?: Readonly<Record<string, AppMessages>>;
  /** Точечные замены строк поверх выбранного языка: `{ 'menu.delete': 'Убрать' }`. Держите объект стабильным. */
  readonly messages?: AppMessages;
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
  /**
   * Где показывать форматирование текста: `'context-menu'` (по умолчанию) — в меню по правому клику,
   * `'toolbar'` — плавающий toolbar над выделением, `'both'` — оба. На сенсорном экране toolbar есть всегда.
   */
  readonly formatting?: FormattingMode;
  /**
   * Проверка орфографии браузера (красное подчёркивание, исправления в контекстном меню браузера). `true` — включить,
   * `{ lang }` — включить для другого языка текста, чем язык интерфейса (`locale`). Не проверяются код, формулы, ссылки
   * и ячейки таблицы с адресами, почтой и телефонами. В режиме чтения выключена. По умолчанию выключена.
   */
  readonly spellcheck?: boolean | { readonly lang?: string };
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
  formatting,
  spellcheck,
}: EditorProviderProps) {
  const view = useMemo(() => new EditorView(), [editor]);

  useLayoutEffect(() => {
    if (readOnly === undefined) return;

    const previous = editor.readOnly;

    editor.setReadOnly(readOnly);

    return () => editor.setReadOnly(previous);
  }, [editor, readOnly]);

  // Язык, который грузится по требованию (`ru`), приходит отдельным чанком: до него интерфейс на английском, потом перевод.
  const [loadedLocales, setLoadedLocales] = useState(0);

  useEffect(() => {
    if (!locale || isLocaleLoaded(locale)) return;

    const own = Object.keys(locales ?? {}).some(
      (code) => code.trim().toLowerCase() === locale.trim().toLowerCase(),
    );

    if (own) return;

    let live = true;

    void preloadLocale(locale).then(() => {
      if (live) setLoadedLocales((count) => count + 1);
    });

    return () => {
      live = false;
    };
  }, [locale, locales]);

  const t = useMemo(
    () => createTranslator(resolveMessages({ locale, locales, messages })),
    // loadedLocales — язык догрузился: словарь стал доступен, перевод надо собрать заново
    [locale, locales, messages, loadedLocales],
  );

  const ui = useMemo(() => {
    const visual = presentation ?? {};
    const code = highlighter ?? visual.highlighter;
    const math = formulaRenderer ?? visual.formulaRenderer;
    const customSlash = slashItems ?? visual.slashItems;
    const customKeys = mergeById(
      (blocks ?? []).flatMap((block) => block.keymap ?? []),
      keymap ?? [],
    );

    return {
      components: { ...blockComponentsOf(blocks), ...visual.components, ...components },
      slots: { ...visual.slots, ...slots },
      // Пункты контроллеров идут после стандартных; пункт приложения с тем же id важнее.
      slashItems:
        customSlash === false
          ? []
          : resolveSlashItems(
              mergeById(
                [
                  ...controllerSlashItems(editor),
                  ...(blocks ?? []).flatMap((block) => block.slashActions ?? []),
                ],
                customSlash ?? [],
              ),
              t,
            ),
      highlighter: code === false ? null : (code ?? lazyHighlightCode),
      formulaRenderer: math === false ? null : (math ?? temmlRenderer),
      locale: locale ?? 'en',
      spellcheck: spellcheck
        ? { lang: (typeof spellcheck === 'object' ? spellcheck.lang : undefined) ?? locale ?? 'en' }
        : (false as const),
      t,
      keymap: resolveKeymap(mergeById(controllerKeymap(editor), customKeys, 'preferred-first')),
      images: images ?? {},
      formatting: formatting ?? 'context-menu',
      contextMenu: (blocks ?? []).flatMap((block) =>
        block.contextMenu ? [block.contextMenu] : [],
      ),
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
    formatting,
    spellcheck,
  ]);

  return (
    <EditorContext.Provider value={editor}>
      <EditorViewContext.Provider value={view}>
        <EditorUIContext.Provider value={ui}>{children}</EditorUIContext.Provider>
      </EditorViewContext.Provider>
    </EditorContext.Provider>
  );
}
