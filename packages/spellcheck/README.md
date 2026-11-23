# @inkbrick/spellcheck

Spelling suggestions from Hunspell dictionaries ([nspell](https://github.com/wooorm/nspell)), off the main thread in a Web
Worker. [Inkbrick](https://github.com/CyberWizard6090/Inkbrick) shows them in its context menu; the package works
without the editor too.

```bash
npm install @inkbrick/spellcheck
```

```ts
import { createSpellchecker } from '@inkbrick/spellcheck';
import SpellWorker from '@inkbrick/spellcheck/worker?worker'; // Vite

const spellchecker = createSpellchecker({
  worker: () => new SpellWorker(),
  languages: {
    en: async () => ({
      aff: await fetchText('/dict/en.aff'),
      dic: await fetchText('/dict/en.dic'),
    }),
  },
  personal: ['Inkbrick'],
  onAdd: (word) => saveWord(word),
});

await spellchecker.suggest('recieve'); // ['receive', …]
await spellchecker.suggest('editor'); // null: correct
spellchecker.add('Inkbrick'); // personal dictionary
```

- A language is loaded on its first word; the language of a word is its script (Cyrillic → `ru`, Latin → `en`), or
  `languageOf(word)`.
- Dictionaries are yours to choose: pass the text or bytes of a Hunspell `.aff` and `.dic` (for example from the
  `dictionary-en` or `dictionary-ru` packages, which ship them). Large dictionaries take seconds and hundreds of megabytes
  to parse — use the `worker`.
- Suggestions are ranked: fewer edits first, then the same length and first letter.

With the editor: `<EditorProvider spellcheck={{ checker: spellchecker }}>`.

## License

MIT. Dictionaries keep their own licenses.
