import { useState } from 'react';

import { TableEditor } from '@inkbrick/react';
import { toMarkdown } from '@inkbrick/document';
import { createTableEditor, type TableValue } from '@inkbrick/engine';

const editor = createTableEditor({
  rows: [
    ['Fruit', 'Qty'],
    ['Apple', '3'],
    ['Pear', '5'],
  ],
});

/** Отдельный редактор таблицы: таблица в форме, значение которой читается вне редактора. */
export function TableDemo() {
  const [value, setValue] = useState<TableValue | null>(null);

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
      <h1>Table editor</h1>
      <TableEditor editor={editor} onChange={setValue} label="Table" />
      <h2>Value</h2>
      <pre data-testid="table-value">{JSON.stringify(value?.rows ?? null)}</pre>
      <h2>Markdown</h2>
      <pre data-testid="table-markdown">{value ? toMarkdown(editor.document) : ''}</pre>
    </main>
  );
}
