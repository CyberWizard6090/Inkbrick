import { describe, expect, it } from 'vitest';

import { createSchemaRegistry, exportSchema } from '../src';

describe('exportSchema', () => {
  it('describes nesting', () => {
    const { blocks } = exportSchema(createSchemaRegistry());

    expect(blocks['block:page'].role).toBe('root');
    expect(blocks['block:page'].children).toEqual(['block:note']);
    expect(blocks['block:list'].children).toContain('block:list');
    expect(blocks['block:paragraph'].children).toEqual([]);
  });
});
