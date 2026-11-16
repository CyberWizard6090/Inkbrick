import type { BaseBlock } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';
import { DeleteBlockChange, RemoveChildChange, SetBlockChange } from '@inkbrick/store';

export const LARGE_DOCUMENT_SIZE = 50_000;

const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(
    ' ',
  );

/** Текст абзаца переменной длины (детерминированный: e2e ищут блоки по номеру). */
function sentence(i: number): string {
  const length = 4 + ((i * 7) % 40);
  const words: string[] = [];

  for (let w = 0; w < length; w++) words.push(WORDS[(i + w * 3) % WORDS.length]);

  return `Block ${i}: ${words.join(' ')}.`;
}

/**
 * Заголовки по шаблону «глава → раздел → подраздел …»: h1 каждые 1000 блоков, h2 каждые 100, а внутри раздела — h3–h6 на
 * фиксированных местах. Так свёртка любого уровня прячет разное число блоков (от десятков до тысячи), а оглавление
 * получает вложенность из шести уровней. Номера в названиях совпадают с номером блока.
 */
const HEADINGS: ReadonlyArray<{
  readonly at: number;
  readonly level: number;
  readonly name: string;
}> = [
  { at: 20, level: 3, name: 'Subsection' },
  { at: 40, level: 4, name: 'Topic' },
  { at: 60, level: 5, name: 'Detail' },
  { at: 80, level: 6, name: 'Note' },
];

function headingAt(i: number): { level: number; text: string } | null {
  if (i % 1000 === 0) return { level: 1, text: `Part ${i / 1000}` };
  if (i % 100 === 0) return { level: 2, text: `Section ${i / 100}` };

  const found = HEADINGS.find(({ at }) => i % 100 === at);

  return found ? { level: found.level, text: `${found.name} ${i}` } : null;
}

function blockAt(i: number, parentId: string): BaseBlock {
  const base = { id: `large-${i}`, parentId, children: [] as string[] };
  const heading = headingAt(i);

  if (heading)
    return {
      ...base,
      flavour: 'block:heading',
      content: [{ insert: heading.text }],
      props: { level: heading.level },
    };
  if (i % 250 === 125)
    return {
      ...base,
      flavour: 'block:code',
      content: [{ insert: `function block${i}() {\n  return ${i};\n}` }],
      props: { language: 'javascript' },
    };
  if (i % 100 === 10)
    return {
      ...base,
      flavour: 'block:quote',
      content: [{ insert: `Quote ${i}: ${sentence(i)}` }],
      props: {},
    };
  if (i % 100 === 30)
    return {
      ...base,
      flavour: 'block:callout',
      content: [{ insert: `Callout ${i}` }],
      props: { tone: i % 200 === 30 ? 'info' : 'warning' },
    };
  if (i % 10 === 5)
    return {
      ...base,
      flavour: 'block:list',
      content: [{ insert: `Item ${i}` }],
      props: { type: i % 20 === 5 ? 'bullet' : 'todo', checked: false },
    };

  return { ...base, flavour: 'block:paragraph', content: [{ insert: sentence(i) }], props: {} };
}

/**
 * Заменяет содержимое документа на `count` блоков (заголовки шести уровней, абзацы, цитаты, выноски, списки, код) одной транзакцией без истории.
 * Блоки пишутся целиком, а не командами: 50 000 вставок по одной заняли бы минуты.
 */
export function loadLargeDocument(editor: Editor, count = LARGE_DOCUMENT_SIZE): void {
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];

  editor.store.transact(
    (tx) => {
      const old = [...tx.getBlock(note)!.children];

      for (const id of old) tx.apply(new RemoveChildChange(note, id));

      const stack = [...old];

      while (stack.length > 0) {
        const id = stack.pop()!;

        stack.push(...(tx.getBlock(id)?.children ?? []));
        tx.apply(new DeleteBlockChange(id));
      }

      const children: string[] = [];

      for (let i = 0; i < count; i++) {
        const block = blockAt(i, note);

        tx.apply(new SetBlockChange(block));
        children.push(block.id);
      }

      tx.apply(new SetBlockChange({ ...tx.getBlock(note)!, children }));
    },
    { history: false },
  );

  editor.clearHistory();
}
