import { useEffect, type RefObject } from 'react';

import { normalizeLinkUrl } from '@inkbrick/document';
import {
  FRAGMENT_MIME,
  fragmentToHtml,
  fragmentToPlainText,
  sanitizeFragment,
  type CaretResult,
  type Fragment,
} from '@inkbrick/engine';

import { blockAtPoint, probePoint } from '../block-handle/geometry';
import { createInputActions } from '../editing/inputActions';
import { readDocSelection, type DocSelection } from '../editing/selection';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { hasExternalImages, rehostExternalImages } from '../images/external';
import { insertImageFiles } from '../images/insertImages';
import { isAcceptedImage } from '../images/upload';
import { setLinkInSelection } from '../toolbar/formatting';
import { useEditorUI } from '../ui/EditorUIContext';
import { embeddedFragment, htmlToFragment } from './htmlToFragment';

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

      const selection = readDocSelection(root);

      if (!selection || selection.collapsed || !event.clipboardData) return;

      const fragment = editor.copyFragment(selection.from, selection.to);

      if (fragment.blocks.length === 0) return;

      const json = JSON.stringify(fragment);

      event.clipboardData.setData('text/plain', fragmentToPlainText(fragment));
      event.clipboardData.setData('text/html', fragmentToHtml(fragment, encodeURIComponent(json)));
      event.clipboardData.setData(FRAGMENT_MIME, json);
      event.preventDefault();

      if (cut && !readOnly) run(() => editor.batch(() => deleteSelection(selection)));
    };

    const pastePlain = (text: string, selection: DocSelection) => {
      const trimmed = text.trim();

      // Адрес поверх выделенного текста делает его ссылкой (как в Slack/Notion), а не заменяет.
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

      if (!plainOnly && !inCode) {
        const json = data.getData(FRAGMENT_MIME);
        const html = data.getData('text/html');

        // Свой формат буфера — копия из этого же редактора; HTML может прийти откуда угодно, и его картинки чужие.
        const own = json ? sanitizeFragment(parseJson(json)) : null;
        const fragment = own ?? (html ? (embeddedFragment(html) ?? htmlToFragment(html)) : null);

        if (fragment && !own && images.rehost && hasExternalImages(fragment)) {
          void pasteRehosted(fragment, selection, text);
          return;
        }

        if (fragment && pasteFragment(fragment, selection)) return;
      }

      if (text) pastePlain(text, selection);
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

    // Перетаскивание картинок из файлового менеджера. Без обработки браузер открыл бы файл вместо редактора.
    const hasFiles = (event: DragEvent) =>
      !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');

    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;

      event.preventDefault();

      const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
        isAcceptedImage(file, images),
      );

      if (readOnly || files.length === 0) return;

      const probe = probePoint(view, event.clientX, event.clientY);
      const target =
        (probe ? blockAtPoint(editor, view, probe.x, probe.y) : null) ??
        readDocSelection(root)?.to.blockId;

      if (target) insertImageFiles(editor, view, images, files, target);
    };

    const onCopy = (event: ClipboardEvent) => writeSelection(event, false);
    const onCut = (event: ClipboardEvent) => writeSelection(event, true);

    root.addEventListener('copy', onCopy);
    root.addEventListener('cut', onCut);
    root.addEventListener('paste', onPaste);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);

    return () => {
      clearTimeout(plainTimer);
      root.removeEventListener('copy', onCopy);
      root.removeEventListener('cut', onCut);
      root.removeEventListener('paste', onPaste);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
    };
  }, [editor, view, ref, readOnly, images, slashItems]);
}
