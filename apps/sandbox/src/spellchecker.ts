import { createSpellchecker, type Dictionary } from '@inkbrick/spellcheck';
import SpellWorker from '@inkbrick/spellcheck/worker?worker';

// Словари Hunspell (пакеты `dictionary-ru`, `dictionary-en`): их вход — только для Node, поэтому берём сами файлы.
import ruAff from '../node_modules/dictionary-ru/index.aff?url';
import ruDic from '../node_modules/dictionary-ru/index.dic?url';
import enAff from '../node_modules/dictionary-en/index.aff?url';
import enDic from '../node_modules/dictionary-en/index.dic?url';

const PERSONAL_KEY = 'inkbrick-sandbox-dictionary';

async function load(aff: string, dic: string): Promise<Dictionary> {
  const [affText, dicText] = await Promise.all([
    fetch(aff).then((response) => response.text()),
    fetch(dic).then((response) => response.text()),
  ]);

  return { aff: affText, dic: dicText };
}

function personalWords(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PERSONAL_KEY) ?? '[]') as unknown;

    return Array.isArray(saved)
      ? saved.filter((word): word is string => typeof word === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Варианты исправления в контекстном меню песочницы: русский и английский словари грузятся при первом слове своего языка
 * в Web Worker; «Добавить в словарь» запоминается в браузере.
 */
export const sandboxSpellchecker = createSpellchecker({
  worker: () => new SpellWorker(),
  languages: {
    ru: () => load(ruAff, ruDic),
    en: () => load(enAff, enDic),
  },
  personal: personalWords(),
  onAdd: (word) => {
    try {
      window.localStorage.setItem(PERSONAL_KEY, JSON.stringify([...personalWords(), word]));
    } catch {
      // Хранилище недоступно: слово помнится до перезагрузки.
    }
  },
});
