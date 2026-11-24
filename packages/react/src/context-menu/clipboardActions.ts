import { selectAllText } from '@inkbrick/view';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Подсказка клавиш для пункта меню: `Ctrl+C` или `⌘C`. */
export function shortcutLabel(key: string): string {
  return isMac() ? `⌘${key}` : `Ctrl+${key}`;
}

/** Вырезать/копировать через событие буфера: его обрабатывает редактор так же, как Ctrl+X/Ctrl+C. */
export function copySelection(cut: boolean): boolean {
  try {
    return globalThis.document.execCommand(cut ? 'cut' : 'copy');
  } catch {
    return false;
  }
}

export function canReadClipboard(): boolean {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

  return (
    !!clipboard &&
    (typeof clipboard.read === 'function' || typeof clipboard.readText === 'function')
  );
}

/**
 * Вставка из меню: браузер не даёт странице событие `paste` без Ctrl+V, поэтому буфер читается через
 * Clipboard API (браузер может спросить разрешение) и передаётся редактору синтетическим событием `paste` —
 * дальше всё как при Ctrl+V: свой формат, HTML, текст, картинки. `false` — буфер прочитать не удалось.
 */
export async function pasteFromClipboard(root: HTMLElement): Promise<boolean> {
  const clipboard = navigator.clipboard;
  const store: Record<string, string> = {};
  const files: File[] = [];

  try {
    if (typeof clipboard.read === 'function') {
      for (const item of await clipboard.read()) {
        for (const type of item.types) {
          const blob = await item.getType(type);

          if (type.startsWith('text/')) store[type] = await blob.text();
          else if (type.startsWith('image/'))
            files.push(new File([blob], `pasted.${type.slice(6)}`, { type }));
        }
      }
    } else {
      store['text/plain'] = await clipboard.readText();
    }
  } catch {
    return false;
  }

  // Обработчику вставки нужны только getData и files; конструктор ClipboardEvent с данными есть не везде.
  const event = new Event('paste', { bubbles: true, cancelable: true });

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => store[type] ?? '',
      setData: () => undefined,
      files,
      types: Object.keys(store),
    },
  });
  root.dispatchEvent(event);

  return true;
}

export function selectAll(root: HTMLElement): void {
  selectAllText(root);
}
