import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';

import type { EditorView } from '../src/editing/EditorView';
import { useEditorView } from '../src/hooks/useEditorView';
import { startMarquee } from '../src/pick/marquee';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

let captured: EditorView | null = null;

function Capture() {
  captured = useEditorView();

  return null;
}

describe('marquee', () => {
  it('a frame released before the next animation frame still picks the blocks it reached', () => {
    const { editor, ids } = mountEditor(['one', 'two', 'three', 'four'], { extra: <Capture /> });

    // В jsdom у блоков нет размеров: раскладываем их друг под другом по 20 пикселей.
    ids.forEach((id, index) => {
      const element = document.querySelector(`[data-block-id="${id}"]`)!;

      element.getBoundingClientRect = () =>
        ({ top: index * 20, bottom: index * 20 + 18, height: 18 }) as DOMRect;
    });

    const marquee = startMarquee(editor, captured!, { x: 0, y: 25 });

    marquee.move(10, 45);
    marquee.move(20, 65);
    // Кадр ещё не выполнился: указатель отпущен сразу после последнего движения.
    marquee.end();

    expect(captured!.picked.getState().ids).toEqual(ids.slice(1, 4));
  });
});
