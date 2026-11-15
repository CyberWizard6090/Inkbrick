import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSchemaRegistry, exportSchema } from '../src';

const file = resolve(__dirname, '../schema/blocks.json');
const expected = `${JSON.stringify(exportSchema(createSchemaRegistry()), null, 2)}\n`;

describe('exported schema', () => {
  // Обновить файл после смены схемы: UPDATE_SCHEMA_JSON=1 pnpm vitest run exportSchema
  if (process.env.UPDATE_SCHEMA_JSON) writeFileSync(file, expected);

  it('schema/blocks.json matches the registry', () => {
    expect(readFileSync(file, 'utf8')).toBe(expected);
  });

  it('describes nesting', () => {
    const { blocks } = exportSchema(createSchemaRegistry());

    expect(blocks['block:page'].role).toBe('root');
    expect(blocks['block:page'].children).toEqual(['block:note']);
    expect(blocks['block:list'].children).toContain('block:list');
    expect(blocks['block:paragraph'].children).toEqual([]);
  });
});
