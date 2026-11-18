# @inkbrick/locales

UI dictionaries of [Inkbrick](https://github.com/CyberWizard6090/Inkbrick): English (the reference, always included)
and the languages that load on demand (currently Russian). No React.

```bash
npm install @inkbrick/locales
```

[`@inkbrick/react`](https://www.npmjs.com/package/@inkbrick/react) depends on this package and loads a language by
itself when `<EditorProvider locale="ru">` asks for it, so most applications never import it directly.

```ts
import { en, localeLoaders, type PartialMessages } from '@inkbrick/locales';

en['menu.delete']; // 'Delete'
const ru: PartialMessages = await localeLoaders.ru(); // a separate chunk
```

Each language is also available as its own entry: `import { ru } from '@inkbrick/locales/ru'`. Keys that a language
does not translate fall back to English. Your own language goes through `registerLocale` or the `locales` prop of
`EditorProvider` in `@inkbrick/react`.

## License

MIT
