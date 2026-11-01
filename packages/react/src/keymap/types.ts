import type { CaretResult, Editor, EditorIntent } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import type { DocSelection } from '../editing/selection';
import type { SlashMenuItem } from '../slash/types';

export interface KeymapContext {
  readonly editor: Editor;
  readonly view: EditorView;
  readonly root: HTMLElement;
  readonly event: KeyboardEvent;
  readonly slashItems: readonly SlashMenuItem[];

  selection(): DocSelection | null;
  exec<T = unknown>(intent: EditorIntent): T | undefined;
  run(action: () => CaretResult | undefined): void;
  replaceSelection(selection: DocSelection, text: string): CaretResult | undefined;
  undo(): void;
  redo(): void;
  toggleFormat(format: string): void;
}

export interface KeyBinding {
  /**
   * Уникальное имя. Привязка с тем же `id`, что у стандартной, заменяет её (на её месте в порядке проверки);
   * остальные проверяются раньше стандартных.
   */
  readonly id: string;
  /**
   * Комбинации: `'Mod-b'`, `'Mod-Shift-z'`, `'Tab'`, `'Shift-Tab'`, `'ArrowDown'`. `Mod` — Ctrl или Cmd.
   * Shift и Alt учитываются точно (`'Tab'` не срабатывает на Shift+Tab). Пустой массив отключает привязку.
   */
  readonly keys: string | readonly string[];
  readonly when?: (context: KeymapContext) => boolean;
  /**
   * Обработчик. `false` — «не моё»: событие идёт дальше по списку привязок и в браузер.
   * Любой другой результат считается обработкой: `preventDefault` вызывается автоматически.
   */
  readonly run: (context: KeymapContext) => boolean | void;
}
