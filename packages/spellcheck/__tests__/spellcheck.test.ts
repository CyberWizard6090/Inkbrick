import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createSpellchecker, scriptLanguage, type Dictionary } from '../src';
import { SpellEngine, distance } from '../src/engine';

// Пакет словаря экспортирует только вход для Node (чтение через fs), поэтому файлы берём по пути.
const folder = join(import.meta.dirname, '..', 'node_modules', 'dictionary-en');
const en: Dictionary = {
  aff: readFileSync(join(folder, 'index.aff')),
  dic: readFileSync(join(folder, 'index.dic')),
};

describe('createSpellchecker (main thread)', () => {
  it('suggests corrections for a misspelled word and nothing for a correct one', async () => {
    const checker = createSpellchecker({ languages: { en: async () => en } });

    expect(await checker.suggest('recieve')).toContain('receive');
    expect(await checker.suggest('editor')).toBeNull();
  });

  it('loads a language once, on its first word, and skips words it cannot check', async () => {
    const load = vi.fn(async () => en);
    const checker = createSpellchecker({ languages: { en: load } });

    expect(await checker.suggest('слово')).toBeNull(); // ru not configured
    expect(await checker.suggest('a1b2')).toBeNull(); // digits
    expect(await checker.suggest('x')).toBeNull(); // too short
    expect(load).not.toHaveBeenCalled();

    await Promise.all([checker.suggest('eror'), checker.suggest('wrold')]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the personal dictionary: words added are correct, onAdd reports them, initial words count from the start', async () => {
    const onAdd = vi.fn();
    const checker = createSpellchecker({
      languages: { en: async () => en },
      personal: ['Inkbrick'],
      onAdd,
    });

    expect(await checker.suggest('Inkbrick')).toBeNull();
    expect(await checker.suggest('zzyzx')).not.toBeNull();

    checker.add('zzyzx');
    expect(onAdd).toHaveBeenCalledWith('zzyzx');
    expect(await checker.suggest('zzyzx')).toBeNull();
  });

  it('a dictionary that fails to load leaves its language unchecked', async () => {
    const checker = createSpellchecker({
      languages: { en: () => Promise.reject(new Error('offline')) },
    });

    expect(await checker.suggest('eror')).toBeNull();
  });
});

describe('createSpellchecker (Web Worker)', () => {
  it('sends the dictionary and the word to the worker and returns its answer', async () => {
    const engine = new SpellEngine();
    const messages: string[] = [];

    // Поддельный Worker: отвечает тем же движком, что и настоящий скрипт.
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;

      postMessage(request: {
        id: number;
        type: string;
        lang?: string;
        word?: string;
        dictionary?: Dictionary;
        limit?: number;
      }) {
        messages.push(request.type);

        const result =
          request.type === 'load'
            ? (engine.load(request.lang!, request.dictionary!), null)
            : request.type === 'add'
              ? (engine.add(request.word!), null)
              : engine.suggest(request.lang!, request.word!, request.limit!);

        queueMicrotask(() =>
          this.onmessage?.({ data: { id: request.id, result } } as MessageEvent),
        );
      }

      terminate() {}
    }

    const create = vi.fn(() => new FakeWorker() as unknown as Worker);
    const checker = createSpellchecker({ worker: create, languages: { en: async () => en } });

    expect(create).not.toHaveBeenCalled();
    expect(await checker.suggest('recieve')).toContain('receive');
    expect(create).toHaveBeenCalledTimes(1);
    expect(messages).toEqual(['load', 'suggest']);
  });
});

describe('scriptLanguage', () => {
  it('Cyrillic is ru, Latin is en, the rest is unchecked', () => {
    expect(scriptLanguage('ошибка')).toBe('ru');
    expect(scriptLanguage('error')).toBe('en');
    expect(scriptLanguage('错误')).toBeUndefined();
  });
});

describe('ranking', () => {
  it('distance counts edits, a swap of neighbours is one edit', () => {
    expect(distance('превет', 'привет')).toBe(1);
    expect(distance('recieve', 'receive')).toBe(1);
    expect(distance('abc', 'abc')).toBe(0);
  });

  it('suggestions with fewer edits, the same length and the same first letter come first', async () => {
    const checker = createSpellchecker({ languages: { en: async () => en } });
    const suggestions = await checker.suggest('wrold');

    expect(suggestions![0]).toBe('world');
  });
});
