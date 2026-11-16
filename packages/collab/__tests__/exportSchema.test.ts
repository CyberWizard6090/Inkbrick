import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSchemaRegistry, exportSchema } from '@inkbrick/document';
import { columnsBlocks, tableBlocks, tocBlocks, toggleBlocks } from '@inkbrick/engine';

/**
 * Правила вложенности для сервера: все блоки редактора, встроенные и из `tableBlocks`, `tocBlocks`, `columnsBlocks`,
 * `toggleBlocks`. Сервер (rabbit-hole-server, internal/editor/schema.json) читает этот файл как есть.
 *
 * Обновить после смены схем: UPDATE_SCHEMA_JSON=1 pnpm vitest run packages/collab/__tests__/exportSchema.test.ts
 * и скопировать packages/collab/schema/blocks.json в internal/editor/schema.json сервера.
 */
const file = resolve(__dirname, '../schema/blocks.json');
const definitions = [...tableBlocks, ...tocBlocks, ...columnsBlocks, ...toggleBlocks];
const expected = exportSchema(createSchemaRegistry(definitions.map((item) => item.schema)));

describe('schema for the server', () => {
  // Форматирование файла не важно (его правит prettier), сравнивается содержимое.
  if (process.env.UPDATE_SCHEMA_JSON) {
    writeFileSync(file, `${JSON.stringify(expected, null, 2)}\n`);
  }

  it('schema/blocks.json matches the schemas of the editor', () => {
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(expected);
  });

  it('knows tables, columns and toggles', () => {
    const { blocks } = expected;

    expect(blocks['block:table'].children).toEqual(['block:table-row']);
    expect(blocks['block:table-row'].children).toEqual(['block:table-cell']);
    expect(blocks['block:columns'].children).toEqual(['block:column']);
    expect(blocks['block:note'].children).toContain('block:toggle');
  });
});
