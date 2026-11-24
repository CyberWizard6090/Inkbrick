import { useEffect, type RefObject } from 'react';

import { isSafeImageUrl, normalizeLinkUrl } from '@inkbrick/document';
import {
  FRAGMENT_MIME,
  fragmentToHtml,
  fragmentToPlainText,
  locateTableCell,
  sanitizeFragment,
  tableFragment,
  type CaretResult,
  type Fragment,
} from '@inkbrick/engine';

import { blockAtPoint, blockElement, probePoint, rowRect } from '../block-handle/geometry';
import { createInputActions } from '../editing/inputActions';
import { deleteBlocks, pickedFragment } from '../pick/actions';
import { readDocSelection, type DocSelection } from '../editing/selection';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { hasExternalImages, isExternalImageUrl, rehostExternalImages } from '../images/external';
import { insertImageFiles, topLevelBlockId } from '../images/insertImages';
import { isAcceptedImage } from '../images/upload';
import { setLinkInSelection } from '../toolbar/formatting';
import { useEditorUI } from '../ui/EditorUIContext';
import { lazyModule } from '../ui/lazy';
import { tabularText } from '@inkbrick/engine/internal';

/** Перетаскивание картинок снаружи: место вставки и разбор картинок с сайтов — отдельный чанк (грузится при первом переносе). */
const externalDrop = lazyModule(() => import('../images/externalDrop'));

/**
 * Разбор HTML из буфера (Google Docs, Word, браузер) — отдельный чанк: он нужен только при вставке чужой разметки. Чанк
 * подгружается сразу после монтирования редактора, поэтому к первой вставке он обычно готов и вставка остаётся
 * синхронной; если нет, вставка ждёт его и ложится на то же место.
 */
const htmlParser = lazyModule(() => import('./htmlParser'), { soon: true });

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i;

/**
 * Текстовое поле внутри пользовательского компонента (подпись картинки, свои input) работает с буфером как обычно.
 * Смотрим на сфокусированный элемент: у события copy цель может быть кнопкой, внутри которой начинается
 * выделение (значок callout, панель картинки), и это не повод отказываться от копирования блоков.
 */
function isForeignControl(_target: EventTarget | null): boolean {
  const active = document.activeElement;

  return (
    active instanceof Element &&
    active.closest('input, textarea, select, [data-inkbrick-ignore-input]') !== null
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Копирование, вырезание и вставка.
 *
 * Копирование кладёт в буфер три формата: простой текст, семантический HTML (для Word, Docs, почты) и точный
 * фрагмент Inkbrick (типы, props, вложенность — для вставки в другой Inkbrick). Вставка выбирает лучший из доступных:
 * точный фрагмент → HTML → простой текст. `Ctrl/Cmd+Shift+V` вставляет только текст. Всё, что пришло из
 * буфера, считается недоверенным и проверяется. Копирование работает и в режиме только чтения.
 */
export function useClipboard(ref: RefObject<HTMLElement | null>, readOnly: boolean) {
  const editor = useEditor();
  const view = useEditorView();
  const { images, slashItems } = useEditorUI();

  useEffect(() => {
    const root = ref.current;

    if (!root) return;

    let plainNext = false;
    let plainTimer: ReturnType<typeof setTimeout> | undefined;

    const { exec, run, deleteSelection, insertAt } = createInputActions(
      editor,
      view,
      root,
      slashItems,
    );

    const writeSelection = (event: ClipboardEvent, cut: boolean) => {
      if (isForeignControl(event.target)) return;

      const pickedIds = view.picked.getState().ids;
      const selection = pickedIds.length > 0 ? null : readDocSelection(root);

      if (!event.clipboardData) return;
      if (pickedIds.length === 0 && (!selection || selection.collapsed)) return;

      // Выбранные блоки копируются целиком, как при выделении от начала первого до конца последнего.
      const fragment = selection
        ? editor.copyFragment(selection.from, selection.to)
        : pickedFragment(editor, pickedIds);

      if (!fragment) return;

      if (fragment.blocks.length === 0) return;

      const json = JSON.stringify(fragment);

      event.clipboardData.setData('text/plain', fragmentToPlainText(fragment));
      event.clipboardData.setData('text/html', fragmentToHtml(fragment, encodeURIComponent(json)));
      event.clipboardData.setData(FRAGMENT_MIME, json);
      event.preventDefault();

      if (cut && !readOnly) {
        if (selection) run(() => editor.batch(() => deleteSelection(selection)));
        else deleteBlocks(editor, view, pickedIds);
      }
    };

    const pastePlain = (text: string, selection: DocSelection) => {
      const trimmed = text.trim();

      // Адрес поверх выделенного текста делает его ссылкой, а не заменяет.
      if (
        !selection.collapsed &&
        selection.from.blockId === selection.to.blockId &&
        URL_ONLY.test(trimmed) &&
        normalizeLinkUrl(trimmed) &&
        editor.store.getBlock(selection.from.blockId)?.flavour !== 'block:code' &&
        setLinkInSelection(editor, view, selection, trimmed)
      ) {
        return;
      }

      const lines = text.replace(/\r\n?/g, '\n').split('\n');

      run(() =>
        editor.batch(() => {
          let caret: CaretResult | undefined = selection.collapsed
            ? { blockId: selection.from.blockId, offset: selection.from.offset }
            : deleteSelection(selection);

          if (!caret) return undefined;

          /*
           * Где Enter вставляет перевод строки (код), текст вставляется целиком: деление по строкам вывело бы
           * из блока на первой же пустой строке.
           */
          const flavour = editor.store.getBlock(caret.blockId)?.flavour ?? '';

          if (editor.schema.getBlockSchema(flavour)?.enter?.mode === 'newline') {
            return insertAt(caret.blockId, caret.offset, lines.join('\n'));
          }

          caret = insertAt(caret.blockId, caret.offset, lines[0]);

          for (const line of lines.slice(1)) {
            if (!caret) return undefined;

            const next: CaretResult | undefined = exec<CaretResult>({
              type: 'splitBlock',
              payload: { blockId: caret.blockId, offset: caret.offset },
            });

            if (!next) return caret;

            caret = insertAt(next.blockId, next.offset, line);
          }

          return caret;
        }),
      );
    };

    const pasteFragment = (fragment: Fragment, selection: DocSelection): boolean => {
      // Проверяем заранее: иначе после удаления выделения вставка могла бы отказать.
      if (!editor.can('pasteFragment', { at: selection.from, fragment })) return false;

      run(() =>
        editor.batch(() => {
          const caret: CaretResult | undefined = selection.collapsed
            ? { blockId: selection.from.blockId, offset: selection.from.offset }
            : deleteSelection(selection);

          return caret
            ? exec<CaretResult>({ type: 'pasteFragment', payload: { at: caret, fragment } })
            : undefined;
        }),
      );

      return true;
    };

    // Вставка ждёт, пока `images.rehost` ответит для чужих картинок: до этого запросов к чужим серверам нет.
    const pasteRehosted = async (fragment: Fragment, selection: DocSelection, text: string) => {
      const resolved = await rehostExternalImages(fragment, images.rehost!);
      const target =
        readDocSelection(root) ??
        (editor.store.getBlock(selection.from.blockId) ? selection : null);

      if (!target || editor.readOnly) return;

      if (resolved.blocks.length > 0 && pasteFragment(resolved, target)) return;
      if (text) pastePlain(text, target);
    };

    const parseHtml = (parser: typeof import('./htmlParser'), html: string): Fragment | null =>
      parser.embeddedFragment(html) ?? parser.htmlToFragment(html);

    /** Вставка разобранного HTML, когда чанк с разбором пришёл позже самого события: те же правила, что и в обычном пути. */
    const pasteParsed = (
      parser: typeof import('./htmlParser'),
      html: string,
      text: string,
      target: DocSelection,
      fallback: (target: DocSelection) => void,
    ) => {
      const fragment = parseHtml(parser, html);

      if (fragment && images.rehost && hasExternalImages(fragment)) {
        void pasteRehosted(fragment, target, text);
        return;
      }

      if (fragment && pasteFragment(fragment, target)) return;

      fallback(target);
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isForeignControl(event.target)) return;

      event.preventDefault();

      const data = event.clipboardData;
      const selection = readDocSelection(root);

      if (readOnly || !data || !selection) return;

      const text = data.getData('text/plain');

      /*
       * Картинка в буфере (снимок экрана, «копировать изображение»): загружаем файл. Если рядом есть текст — это
       * обычная вставка (например, из таблицы), и файлы игнорируются.
       */
      const files = [...data.files].filter((file) => isAcceptedImage(file, images));

      if (files.length > 0 && text.trim() === '') {
        plainNext = false;

        insertImageFiles(editor, view, images, files, selection.to.blockId);
        return;
      }

      const plainOnly = plainNext;

      plainNext = false;

      const inCode = editor.store.getBlock(selection.from.blockId)?.flavour === 'block:code';

      // Что делать, когда ни фрагмент, ни HTML не подошли: таблица из текста с табуляциями или просто текст.
      const fallback = (target: DocSelection) => {
        // Текст с табуляциями, похожий на таблицу (Excel, Sheets, терминал), — таблица; Ctrl+Shift+V вставляет текстом.
        // Внутри таблицы и одна строка с табуляциями ложится по ячейкам; вне таблицы нужно две строки и больше.
        const inTable = !!locateTableCell((id) => editor.store.getBlock(id), target.from.blockId);
        const rows =
          !plainOnly && !inCode && editor.schema.hasBlock('block:table')
            ? tabularText(text, { singleRow: inTable })
            : null;

        if (rows && pasteFragment(tableFragment(rows, { header: false }), target)) return;

        if (text) pastePlain(text, target);
      };

      if (!plainOnly && !inCode) {
        const json = data.getData(FRAGMENT_MIME);
        const html = data.getData('text/html');

        // Свой формат буфера — копия из этого же редактора; HTML может прийти откуда угодно, и его картинки чужие.
        const own = json ? sanitizeFragment(parseJson(json)) : null;
        const parser = htmlParser.get();

        // Чужой HTML, а чанк с разбором ещё не пришёл (вставка в первые мгновения): ждём его и вставляем на то же место.
        if (!own && html && !parser) {
          void htmlParser.preload().then((loaded) => {
            const target =
              readDocSelection(root) ??
              (editor.store.getBlock(selection.from.blockId) ? selection : null);

            if (!target || editor.readOnly) return;

            pasteParsed(loaded, html, text, target, fallback);
          });
          return;
        }

        const fragment = own ?? (html && parser ? parseHtml(parser, html) : null);

        if (fragment && !own && images.rehost && hasExternalImages(fragment)) {
          void pasteRehosted(fragment, selection, text);
          return;
        }

        if (fragment && pasteFragment(fragment, selection)) return;
      }

      fallback(selection);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // В режиме чтения Backspace на документе ничего не делает (в WebKit он иначе уходит назад по истории).
      if (readOnly && event.key === 'Backspace' && !isForeignControl(event.target)) {
        event.preventDefault();
        return;
      }

      if (
        readOnly &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        const selection = globalThis.getSelection();

        event.preventDefault();
        selection?.removeAllRanges();

        const range = document.createRange();
        range.selectNodeContents(root);
        selection?.addRange(range);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        plainNext = true;
        clearTimeout(plainTimer);
        plainTimer = setTimeout(() => {
          plainNext = false;
        }, 1000);
      }
    };

    // Перетаскивание картинок снаружи: файлы из файлового менеджера и картинки с сайтов. Пока картинку несут над
    // документом, линия вставки показывает, куда она встанет (как у переноса блока). Без обработки браузер открыл бы
    // файл вместо редактора.
    // Перетаскивание картинок снаружи: файлы и картинки с сайтов. Пока картинку несут над документом, линия вставки
    // показывает, куда она встанет (как у переноса блока); вся работа — в отдельном чанке. Без обработки браузер
    // открыл бы файл вместо редактора.
    const dropContext = {
      editor,
      view,
      root,
      images,
      readOnly,
      geometry: { probePoint, blockAtPoint, rowRect, blockElement, topLevelBlockId },
      insert: insertImageFiles,
      isAccepted: isAcceptedImage,
      isSafe: isSafeImageUrl,
      isExternal: isExternalImageUrl,
      caretBlock: () => readDocSelection(root)?.to.blockId,
    };

    const onDragOver = (event: DragEvent) => {
      const types = event.dataTransfer?.types ?? [];

      if (!types.includes('Files') && !types.includes('text/uri-list')) return;

      event.preventDefault();
      event.dataTransfer!.dropEffect = readOnly ? 'none' : 'copy';

      const drop = externalDrop.get();

      if (drop) drop.over(dropContext, event.clientX, event.clientY);
      else void externalDrop.preload();
    };

    const onDragLeave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && root.contains(event.relatedTarget))) {
        externalDrop.get()?.leave(dropContext);
      }
    };

    const onDrop = (event: DragEvent) => {
      const data = event.dataTransfer;

      if (!data || (!data.types.includes('Files') && !data.types.includes('text/uri-list'))) return;

      event.preventDefault();

      // Что принесли, читается сразу: потом браузер этого не отдаёт.
      const dropped = {
        files: [...data.files],
        html: data.getData('text/html'),
        uriList: data.getData('text/uri-list'),
        x: event.clientX,
        y: event.clientY,
      };

      void externalDrop.preload().then((drop) => drop.drop(dropContext, dropped));
    };

    const onCopy = (event: ClipboardEvent) => writeSelection(event, false);
    const onCut = (event: ClipboardEvent) => writeSelection(event, true);

    // Блоки выбраны, выделения текста нет: браузер отправляет copy и cut не в корень, а в body. Берём их, пока фокус в корне.
    const outside = (handler: (event: ClipboardEvent) => void) => (event: ClipboardEvent) => {
      if (
        !event.defaultPrevented &&
        view.picked.size > 0 &&
        globalThis.document.activeElement === root &&
        !(event.target instanceof Node && root.contains(event.target))
      )
        handler(event);
    };
    const onPageCopy = outside(onCopy);
    const onPageCut = outside(onCut);

    globalThis.document.addEventListener('copy', onPageCopy);
    globalThis.document.addEventListener('cut', onPageCut);
    root.addEventListener('copy', onCopy);
    root.addEventListener('cut', onCut);
    root.addEventListener('paste', onPaste);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave);
    root.addEventListener('drop', onDrop);

    return () => {
      clearTimeout(plainTimer);
      globalThis.document.removeEventListener('copy', onPageCopy);
      globalThis.document.removeEventListener('cut', onPageCut);
      root.removeEventListener('copy', onCopy);
      root.removeEventListener('cut', onCut);
      root.removeEventListener('paste', onPaste);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
      externalDrop.get()?.leave(dropContext);
    };
  }, [editor, view, ref, readOnly, images, slashItems]);
}
