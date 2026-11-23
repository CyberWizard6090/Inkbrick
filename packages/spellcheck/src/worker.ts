/// <reference lib="webworker" />

/**
 * Скрипт Web Worker проверки орфографии. Словари (особенно русский: сотни тысяч форм) разбираются секунды и занимают
 * сотни мегабайт, поэтому это делается не в основном потоке. Приложение запускает скрипт своим сборщиком:
 *
 * ```ts
 * // Vite
 * import SpellWorker from '@inkbrick/spellcheck/worker?worker';
 * createSpellchecker({ worker: () => new SpellWorker(), languages });
 * ```
 */
import { SpellEngine } from './engine';
import type { SpellRequest, SpellResponse } from './protocol';

const engine = new SpellEngine();
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<SpellRequest>) => {
  const request = event.data;
  let response: SpellResponse;

  try {
    if (request.type === 'load') {
      engine.load(request.lang, request.dictionary);
      response = { id: request.id, result: null };
    } else if (request.type === 'add') {
      engine.add(request.word);
      response = { id: request.id, result: null };
    } else {
      response = {
        id: request.id,
        result: engine.suggest(request.lang, request.word, request.limit),
      };
    }
  } catch (error) {
    response = { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }

  scope.postMessage(response);
};
