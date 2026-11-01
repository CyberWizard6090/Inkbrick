// @vitest-environment node
import temml from 'temml';
import { describe, expect, it } from 'vitest';

import { CARET, SYMBOL_CATEGORIES } from '../src/formula/symbols';

describe('symbol palette: LaTeX validity', () => {
  it('every template is accepted by Temml (the built-in renderer)', () => {
    const failures: string[] = [];

    for (const { items } of SYMBOL_CATEGORIES) {
      for (const item of items) {
        const code = `x${item.snippet.split(CARET).join('')}`;

        try {
          temml.renderToString(code, { throwOnError: true, trust: false, strict: false });
        } catch (error) {
          failures.push(`${item.snippet}: ${(error as Error).message}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
